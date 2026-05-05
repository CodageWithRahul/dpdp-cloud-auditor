from django.db.models import Count, F, Q, Case, When, Value, IntegerField
from django.http import FileResponse
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView

from scanner.models import Finding, ScanJob, ScanJobLog
from scanner.serializers import ScanJobLogSerializer

from .models import ScanResult
from .report_generator import generate_excel_report, generate_pdf_report
from .serializers import ReportSummarySerializer, ScanResultSerializer
from .services import (
    get_cloud_account_for_user,
    get_scan_job_for_user,
    get_scan_regions_for_jobs,
)
from .risk import group_scan_results, top_risks


class ScanResultListView(ListAPIView):
    """List all scan results for a scan job with optional filtering."""

    serializer_class = ScanResultSerializer
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        grouped = request.query_params.get("grouped", "false").lower() in {
            "true",
            "1",
            "yes",
        }
        if not grouped:
            return super().list(request, *args, **kwargs)

        queryset = self.get_queryset()
        rows = queryset.values(
            "check_id",
            "check_title",
            "severity",
            "service_name",
            "region",
            "resource_id",
            "description",
            "status",
        )

        payload = group_scan_results(rows)

        # Backward-compatible aliases for older clients that expect these names.
        for item in payload:
            item["affected_resource_count"] = item.get("affected_count", 0)
            item["finding_count"] = sum((item.get("status_breakdown") or {}).values())
            item["service_name"] = (item.get("services") or [None])[0]
            item["check_title"] = item.get("issue_type")
            item["remediation"] = {
                "title": item.get("issue_type"),
                "risk": item.get("risk"),
                "steps": (item.get("fix") or {}).get("steps", []),
                "difficulty": (item.get("fix") or {}).get("effort"),
                "estimated_time": "",
            }

        return Response(payload)

    def get_queryset(self):
        scan_job_id = self.kwargs.get("scan_job_id")
        scan_job = get_scan_job_for_user(self.request.user, scan_job_id)

        queryset = ScanResult.objects.filter(scan_job=scan_job).select_related(
            "scan_job"
        )

        status = self.request.query_params.get("status")
        severity = self.request.query_params.get("severity")
        service = self.request.query_params.get("service_name")

        if status:
            queryset = queryset.filter(status__iexact=status)
        if severity:
            queryset = queryset.filter(severity__iexact=severity)
        if service:
            queryset = queryset.filter(service_name__iexact=service)

        # 🔥 Severity sorting (HIGH → MEDIUM → LOW)
        queryset = queryset.annotate(
            severity_rank=Case(
                When(severity__iexact="critical", then=Value(1)),
                When(severity__iexact="high", then=Value(2)),
                When(severity__iexact="medium", then=Value(3)),
                When(severity__iexact="low", then=Value(4)),
                default=Value(5),
                output_field=IntegerField(),
            )
        ).order_by("severity_rank")

        return queryset


class TopRisksView(APIView):
    """
    Return top N grouped risks for a scan job (deduped by check_id).

    Query params:
      - limit: 1..10 (default 5)
      - status/severity/service_name: same filters as results endpoint
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, scan_job_id):
        base_view = ScanResultListView()
        base_view.request = request
        base_view.kwargs = {"scan_job_id": scan_job_id}

        queryset = base_view.get_queryset()
        rows = queryset.values(
            "check_id",
            "check_title",
            "severity",
            "service_name",
            "region",
            "resource_id",
            "description",
            "status",
        )
        grouped = group_scan_results(rows)
        limit = request.query_params.get("limit", 5)
        payload = top_risks(grouped, limit=limit)
        return Response(payload)


class ScanResultDetailView(RetrieveAPIView):
    """Retrieve a single scan result that belongs to the requesting user."""

    serializer_class = ScanResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ScanResult.objects.select_related("scan_job__cloud_account").filter(
            scan_job__cloud_account__user=self.request.user
        )


class ReportSummaryView(APIView):
    """Return summary metrics for a scan job."""

    permission_classes = [IsAuthenticated]

    def get(self, request, scan_job_id):
        scan_job = get_scan_job_for_user(request.user, scan_job_id)
        queryset = ScanResult.objects.filter(scan_job=scan_job)

        total_checks = queryset.count()
        status_aggregation = queryset.values("status").annotate(count=Count("id"))
        status_map = {item["status"]: item["count"] for item in status_aggregation}

        severity_aggregation = queryset.values("severity").annotate(count=Count("id"))
        severity_count = {key: 0 for key, _ in ScanResult.SEVERITY_CHOICES}
        for item in severity_aggregation:
            severity_count[item["severity"]] = item["count"]

        cloud_account = getattr(scan_job, "cloud_account", None)
        scan_date = scan_job.completed_at or scan_job.started_at or timezone.now()
        metadata = {
            "scan_job_id": scan_job.id,
            "scan_date": scan_date,
            "report_generated_at": timezone.now(),
            "generated_by": "Cloud Auditor",
            "cloud_account_id": cloud_account.id if cloud_account else None,
            "cloud_account_name": cloud_account.account_name if cloud_account else None,
            "cloud_account_provider": (
                cloud_account.get_provider_display() if cloud_account else None
            ),
            "requested_by": {
                "username": request.user.username,
                "full_name": request.user.get_full_name() or request.user.username,
                "email": request.user.email or "",
            },
            "scan_regions": get_scan_regions_for_jobs([scan_job]),
        }
        scan_logs = ScanJobLogSerializer(
            scan_job.logs.order_by("created_at"), many=True
        ).data

        payload = {
            **metadata,
            "total_checks": total_checks,
            "passed": status_map.get("PASS", 0),
            "failed": status_map.get("FAIL", 0),
            "warnings": status_map.get("WARNING", 0),
            "severity_count": severity_count,
            "scan_logs": scan_logs,
        }

        serializer = ReportSummarySerializer(payload)
        return Response(serializer.data)


class ServiceWiseReportView(APIView):
    """Return aggregated totals grouped by service name."""

    permission_classes = [IsAuthenticated]

    def get(self, request, scan_job_id):
        scan_job = get_scan_job_for_user(request.user, scan_job_id)
        queryset = ScanResult.objects.filter(scan_job=scan_job)

        grouped = (
            queryset.values(service=F("service_name"))
            .annotate(
                total=Count("id"),
                failed=Count("id", filter=Q(status="FAIL")),
            )
            .order_by("service")
        )

        return Response(list(grouped))


class CloudAccountScanResultsView(ListAPIView):
    """List scan results for a specific cloud account; optional scan_job_id filters to a single job."""

    serializer_class = ScanResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        cloud_account_id = self.kwargs.get("cloud_account_id")
        cloud_account = get_cloud_account_for_user(self.request.user, cloud_account_id)

        queryset = (
            ScanResult.objects.filter(scan_job__cloud_account=cloud_account)
            .select_related("scan_job")
            .order_by("-created_at")
        )

        scan_job_id = self.request.query_params.get("scan_job_id")
        if scan_job_id:
            queryset = queryset.filter(scan_job_id=scan_job_id)

        return queryset


def _build_report_context(user, scan_job_id, cloud_account_id):
    """Return findings queryset and report context matching the requested scope."""

    if scan_job_id:
        scan_job = get_scan_job_for_user(user, scan_job_id)
        findings = (
            Finding.objects.filter(scan_job=scan_job)
            .select_related("scan_job")
            .order_by("-created_at")
        )
        report_context = {
            "scan_job": scan_job,
            "scan_jobs": [scan_job],
            "cloud_account": getattr(scan_job, "cloud_account", None),
        }
        report_context["scan_regions"] = get_scan_regions_for_jobs(
            report_context["scan_jobs"]
        )
        return findings, report_context

    cloud_account = get_cloud_account_for_user(user, cloud_account_id)
    scan_jobs = list(
        ScanJob.objects.filter(cloud_account=cloud_account).order_by("-started_at")
    )
    findings = (
        Finding.objects.filter(scan_job__cloud_account=cloud_account)
        .select_related("scan_job")
        .order_by("-created_at")
    )
    report_context = {
        "scan_jobs": scan_jobs,
        "cloud_account": cloud_account,
    }
    report_context["scan_regions"] = get_scan_regions_for_jobs(
        report_context["scan_jobs"]
    )
    return findings, report_context


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_pdf_report(request):
    """Return the cloud scan findings as a PDF report."""

    scan_job_id = request.query_params.get("scan_job_id")
    cloud_account_id = request.query_params.get("cloud_account_id")
    if not scan_job_id and not cloud_account_id:
        return Response(
            {
                "detail": "Provide either scan_job_id or cloud_account_id query parameter."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    findings, report_context = _build_report_context(
        request.user, scan_job_id, cloud_account_id
    )
    include_logs = request.query_params.get("include_logs", "false").lower() in {
        "true",
        "1",
        "yes",
    }
    scan_logs = []
    if include_logs:
        scan_job = report_context.get("scan_job")
        if scan_job:
            scan_logs = list(scan_job.logs.order_by("created_at"))
        else:
            scan_jobs = report_context.get("scan_jobs") or []
            scan_logs = list(
                ScanJobLog.objects.filter(scan_job__in=scan_jobs).order_by("created_at")
            )
    pdf_buffer = generate_pdf_report(
        findings,
        report_context,
        request.user,
        scan_logs=scan_logs if include_logs else None,
    )
    pdf_buffer.seek(0)
    return FileResponse(
        pdf_buffer,
        as_attachment=True,
        filename="cloud_scan_report.pdf",
        content_type="application/pdf",
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_excel_report(request):
    """Return the cloud scan findings as an Excel report."""

    scan_job_id = request.query_params.get("scan_job_id")
    cloud_account_id = request.query_params.get("cloud_account_id")
    if not scan_job_id and not cloud_account_id:
        return Response(
            {
                "detail": "Provide either scan_job_id or cloud_account_id query parameter."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    findings, report_context = _build_report_context(
        request.user, scan_job_id, cloud_account_id
    )
    include_logs = request.query_params.get("include_logs", "false").lower() in {
        "true",
        "1",
        "yes",
    }
    scan_logs = []
    if include_logs:
        scan_job = report_context.get("scan_job")
        if scan_job:
            scan_logs = list(scan_job.logs.order_by("created_at"))
        else:
            scan_jobs = report_context.get("scan_jobs") or []
            scan_logs = list(
                ScanJobLog.objects.filter(scan_job__in=scan_jobs).order_by("created_at")
            )
    excel_buffer = generate_excel_report(
        findings,
        report_context,
        request.user,
        scan_logs=scan_logs if include_logs else None,
    )
    excel_buffer.seek(0)
    return FileResponse(
        excel_buffer,
        as_attachment=True,
        filename="cloud_scan_report.xlsx",
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
