import json
import logging

from google.oauth2 import service_account

from scanner.runners.gcp_runner import GCPScanContext, run_all_checks
from scanner.utils.save_findings import persist_findings

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


def _load_service_account_info(raw_value):
    if isinstance(raw_value, dict):
        return raw_value

    if isinstance(raw_value, str):
        return json.loads(raw_value)

    raise ValueError("service_account_json must be a JSON object or string.")


def run_gcp_scan(scan_job, account, regions=None):
    credentials = account.credentials or {}
    service_account_json = credentials.get("service_account_json")

    if not service_account_json:
        raise RuntimeError("Missing GCP service_account_json credential.")

    try:
        info = _load_service_account_info(service_account_json)
    except ValueError as exc:
        logger.error("Invalid GCP service account payload: %s", exc)
        raise RuntimeError("Invalid GCP service account JSON.") from exc

    project_id = info.get("project_id")
    if not project_id:
        raise RuntimeError("service_account_json must contain a project_id.")

    try:
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=_SCOPES
        )
    except Exception as exc:
        logger.error("Failed to build GCP credentials: %s", exc)
        raise RuntimeError("Unable to build GCP credentials for scan.") from exc

    context = GCPScanContext(credentials=creds, project_id=project_id)

    formatted_regions = [region for region in (regions or []) if region]
    region_suffix = f" ({', '.join(formatted_regions)})" if formatted_regions else ""

    scan_job.log(
        f"Discovering available GCP services before running checks{region_suffix}."
    )

    def _log(message, level="INFO"):
        scan_job.log(message, level=level)

    region_tag = None
    if formatted_regions:
        region_tag = (
            formatted_regions[0]
            if len(formatted_regions) == 1
            else ", ".join(formatted_regions)
        )

    try:
        result = run_all_checks(
            context, log=_log, stop_requested=lambda: scan_job.cancel_requested
        )
    except Exception as exc:
        logger.error("GCP runner raised an exception: %s", exc)
        raise RuntimeError(
            "Unable to complete GCP checks with current credentials"
        ) from exc

    for finding in result["findings"]:
        if region_tag:
            finding.setdefault("region", region_tag)
    findings = result["findings"]
    persisted = persist_findings(scan_job, findings)

    scanned = result["scanned_services"]
    skipped = result["skipped_services"]
    interrupted = scan_job.cancel_requested

    if interrupted:
        if scanned:
            summary_message = f"Scan interrupted by user after running {', '.join(scanned)}{region_suffix}."
        else:
            summary_message = (
                f"Scan interrupted by user before running GCP checks{region_suffix}."
            )
        scan_job.log(summary_message, level="WARNING")
    elif not scanned:
        summary_message = (
            f"No active services detected; nothing was scanned for GCP{region_suffix}."
        )
        scan_job.log(summary_message, level="INFO")
    else:
        summary_message = f"Completed checks for {', '.join(scanned)}{region_suffix}."
        scan_job.log(summary_message, level="SUCCESS")
        if skipped:
            scan_job.log(
                f"Skipped {', '.join(skipped)} because those checks failed to execute.",
                level="WARNING",
            )

    return {
        "scanned_resources": persisted,
        "issues_found": len(findings),
        "scanned_services": scanned,
        "skipped_services": skipped,
        "interrupted": interrupted,
        "message": summary_message,
    }
