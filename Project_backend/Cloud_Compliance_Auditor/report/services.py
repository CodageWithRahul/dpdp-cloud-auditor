from django.shortcuts import get_object_or_404

from accounts.models import CloudAccount
from scanner.models import ScanJob


def get_scan_regions_for_jobs(scan_jobs):
    """Return an ordered list of regions referenced by the provided scan jobs."""

    seen = []
    for job in scan_jobs or []:
        if not job:
            continue

        regions = getattr(job, "target_regions", None) or []
        if regions:
            for region in regions:
                candidate = region.strip()
                if candidate and candidate not in seen:
                    seen.append(candidate)
            continue

        extracted = job.target_regions_text()
        if extracted:
            for region in extracted.split(","):
                candidate = region.strip()
                if candidate and candidate not in seen:
                    seen.append(candidate)

    return seen


def get_scan_job_for_user(user, scan_job_id):
    """Return a ScanJob owned by user or raise Http404 if it is missing."""

    return get_object_or_404(
        ScanJob.objects.select_related("cloud_account"),
        id=scan_job_id,
        cloud_account__user=user,
    )


def get_cloud_account_for_user(user, cloud_account_id):
    """Return a CloudAccount owned by user or raise Http404 if it is missing."""

    return get_object_or_404(
        CloudAccount.objects.select_related("user"),
        id=cloud_account_id,
        user=user,
    )
