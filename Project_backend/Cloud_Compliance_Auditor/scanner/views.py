from django.db.models import Prefetch, Sum
from django.utils import timezone
import threading
from googleapiclient.errors import HttpError


from typing import Sequence

from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.core.cache import cache

from .pagination import ScanHistoryPagination
from accounts.models import CloudAccount
from accounts.services.region_selector import get_regions
from .models import Finding, ScanJob, ScanJobLog
from .serializers import (
    FindingSerializer,
    ScanHistorySerializer,
    ScanJobLogSerializer,
    StartScanSerializer,
)

from scanner.services.aws_scanner import run_aws_scan
from scanner.services.azure_scanner import run_azure_scan
from scanner.services.gcp_scanner import run_gcp_scan


class StartScanView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = StartScanSerializer

    def post(self, request):

        serializer = self.serializer_class(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        cloud_account_id = serializer.validated_data["cloud_account_id"]

        try:
            account = CloudAccount.objects.get(id=cloud_account_id)
        except CloudAccount.DoesNotExist:
            return Response({"error": "Cloud account not found"}, status=404)

        scan_job = ScanJob.objects.create(cloud_account=account, status="PENDING")
        scan_job.status = "RUNNING"
        scan_job.save(update_fields=["status"])
        scan_job.log("Scan job marked as RUNNING.")

        scan_all = serializer.validated_data.get("scan_all_regions", False)

        requested_regions = list(serializer.validated_data.get("regions") or [])

        single_region = serializer.validated_data.get("region")

        if single_region:
            normalized = single_region.strip()
            if normalized:
                if normalized.upper() == "ALL":
                    scan_all = True
                    requested_regions = []
                else:
                    requested_regions.insert(0, normalized)

        regions = _resolve_scan_regions(
            account,
            requested_regions,
            scan_all=scan_all,
            scan_job=scan_job,
        )
        if regions != scan_job.target_regions:
            scan_job.target_regions = regions
            scan_job.save(update_fields=["target_regions"])
        if regions:
            scan_job.log(f"Target regions: {', '.join(regions)}.", level="INFO")

        run_book = {
            "AWS": run_aws_scan,
            "GCP": run_gcp_scan,
            "AZURE": run_azure_scan,
        }
        run_scan = run_book.get(account.provider)

        if not run_scan:
            scan_job.status = "FAILED"
            scan_job.completed_at = timezone.now()
            scan_job.save(update_fields=["status", "completed_at"])
            message = f"Unsupported provider {account.provider}."
            scan_job.log(message, level="ERROR")
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)

        thread = threading.Thread(
            target=background_scan,
            args=(scan_job.id, account, regions, run_scan),
            daemon=True,
        )

        thread.start()

        return Response(
            {
                "message": "Scan started",
                "scan_id": scan_job.id,
                "status": scan_job.status,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class ScanJobLogListView(ListAPIView):

    permission_classes = [IsAuthenticated]
    serializer_class = ScanJobLogSerializer

    def get_queryset(self):
        scan_job_id = self.kwargs.get("scan_job_id")
        return ScanJobLog.objects.filter(
            scan_job__id=scan_job_id,
            scan_job__cloud_account__user=self.request.user,
        ).order_by("created_at")


class ScanJobFindingListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = FindingSerializer

    def get_queryset(self):
        scan_job_id = self.kwargs.get("scan_job_id")
        return Finding.objects.filter(
            scan_job__id=scan_job_id,
            scan_job__cloud_account__user=self.request.user,
        ).order_by("-created_at")


class ScanHistory(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ScanHistorySerializer
    pagination_class = ScanHistoryPagination

    def get_queryset(self):

        region_log_prefetch = Prefetch(
            "logs",
            queryset=ScanJobLog.objects.filter(
                message__startswith="Target regions:"
            ).order_by("-created_at")[:3],
            to_attr="target_region_logs",
        )

        return (
            ScanJob.objects.select_related("cloud_account")
            .prefetch_related(region_log_prefetch, "cloud_account__regions")
            .filter(cloud_account__user=self.request.user)
            .order_by("-started_at")
        )


class ScanStats(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scans = ScanJob.objects.filter(cloud_account__user=request.user)

        total_scans = scans.count()
        last_scan = scans.order_by("-started_at").first()

        total_findings = Finding.objects.filter(
            scan_job__cloud_account__user=request.user
        ).count()

        return Response(
            {
                "total_scans": total_scans,
                "total_findings": total_findings,
                "last_scan_status": last_scan.status if last_scan else None,
            }
        )


class StopScanView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, scan_job_id):
        try:
            scan_job = ScanJob.objects.select_related("cloud_account").get(
                id=scan_job_id, cloud_account__user=request.user
            )
        except ScanJob.DoesNotExist:
            return Response({"error": "Scan job not found"}, status=404)

        if scan_job.status not in {"RUNNING", "PENDING"}:
            return Response(
                {"error": f"Cannot interrupt a scan with status {scan_job.status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        scan_job.cancel_requested = True
        scan_job.status = "INTERRUPTED"
        scan_job.completed_at = timezone.now()
        scan_job.save(update_fields=["cancel_requested", "status", "completed_at"])
        scan_job.log("Scan interrupted by user request.", level="WARNING")

        return Response(
            {
                "scan_id": scan_job.id,
                "message": "Scan interrupted by user request.",
                "status": scan_job.status,
            }
        )


class ScanStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, scan_job_id):
        try:
            scan_job = ScanJob.objects.select_related("cloud_account").get(
                id=scan_job_id, cloud_account__user=request.user
            )
        except ScanJob.DoesNotExist:
            return Response({"error": "Scan job not found"}, status=404)

        # -------------------------------
        # GET PROGRESS FROM CACHE
        # -------------------------------
        progress_data = cache.get(f"scan_progress_{scan_job_id}", {})

        return Response(
            {
                "scan_id": scan_job.id,
                "status": scan_job.status,
                "cancel_requested": scan_job.cancel_requested,
                "progress": progress_data.get("progress", 0),
                "completed_units": progress_data.get("completed_units", 0),
                "total_units": progress_data.get("total_units", 0),
                "current_service": progress_data.get("current_service"),
                "current_region": progress_data.get("current_region"),
            }
        )


class ScanMetadataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, scan_job_id):
        try:
            scan_job = ScanJob.objects.select_related("cloud_account").get(
                id=scan_job_id, cloud_account__user=request.user
            )
        except ScanJob.DoesNotExist:
            return Response({"error": "Scan job not found"}, status=404)
        return Response(
            {
                "scan_id": scan_job.id,
                "account_name": scan_job.cloud_account.account_name,
                "provider": scan_job.cloud_account.provider,
                "region": scan_job.target_regions,
            }
        )


def background_scan(scan_job_id, account, regions, run_scan):
    scan_job = ScanJob.objects.get(id=scan_job_id)

    print(
        f"Starting background scan for job {scan_job_id} on account {account.account_name} with regions: {regions}"
    )

    try:
        scan_job.log("Background scan started.", level="INFO")

        summary = run_scan(scan_job, account, regions=regions)

        interrupted = summary.get("interrupted") or scan_job.cancel_requested

        scan_job.total_resources = summary.get("scanned_resources", 0)
        scan_job.issues_found = summary.get("issues_found", 0)

        scan_job.completed_at = timezone.now()
        scan_job.status = "INTERRUPTED" if interrupted else "COMPLETED"

        scan_job.save(
            update_fields=[
                "total_resources",
                "issues_found",
                "completed_at",
                "status",
            ]
        )

        if interrupted:
            scan_job.log("Scan interrupted by user.", level="WARNING")
        else:
            scan_job.log("Scan completed successfully.", level="INFO")

    # ✅ Handle GCP-specific errors
    except HttpError as exc:
        message = str(exc)

        if "has been deleted" in message:
            reason = "GCP project has been deleted."
        elif "permission" in message.lower():
            reason = "Permission denied. Check IAM roles."
        else:
            reason = "GCP API error occurred."

        scan_job.status = "FAILED"
        scan_job.completed_at = timezone.now()

        scan_job.save(update_fields=["status", "completed_at"])
        scan_job.log(f"Scan failed: {reason}", level="ERROR")

    # ✅ Catch everything else (IMPORTANT)
    except Exception as exc:
        scan_job.status = "FAILED"
        scan_job.completed_at = timezone.now()

        scan_job.save(update_fields=["status", "completed_at"])
        scan_job.log(f"Scan failed: {str(exc)}", level="ERROR")


def _normalize_regions(regions: Sequence[str] | None) -> list[str]:
    if not regions:
        return []

    normalized = []
    for raw in regions:
        if not raw:
            continue

        candidate = raw.strip()
        if not candidate or candidate in normalized:
            continue
        normalized.append(candidate)

    return normalized


def _resolve_scan_regions(
    account: CloudAccount,
    requested: Sequence[str] | None,
    scan_all: bool = False,
    scan_job: ScanJob | None = None,
) -> list[str]:

    normalized = _normalize_regions(requested)
    if normalized and not scan_all:
        return normalized

    db_regions = [
        region.strip()
        for region in account.regions.values_list("region_name", flat=True)
        if region and region.strip()
    ]
    if db_regions:
        return db_regions

    credentials = account.get_credentials() or {}
    fetched_regions, error = get_regions(account.provider, credentials)
    if fetched_regions:
        cleaned = [
            region.strip() for region in fetched_regions if region and region.strip()
        ]
        if cleaned:
            return cleaned

    if error and scan_job:
        scan_job.log(
            f"Could not resolve all provider regions: {error}",
            level="WARNING",
        )

    return []
