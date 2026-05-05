import json
import logging
from typing import List

from google.oauth2 import service_account
from googleapiclient.discovery import build

from scanner.runners.gcp_runner import (
    GCPScanContext,
    calculate_gcp_total_units,
    run_all_checks,
)
from scanner.utils.save_findings import persist_findings
from scanner.utils.progress_tracker import ProgressTracker, TakenTime

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


# -------------------------------
# Helpers
# -------------------------------


def _load_service_account_info(raw_value):
    if isinstance(raw_value, dict):
        return raw_value
    if isinstance(raw_value, str):
        return json.loads(raw_value)
    raise ValueError("service_account_json must be a JSON object or string.")


def _get_all_regions(credentials, project_id) -> List[str]:
    """
    Fetch all available regions dynamically.
    Fallback used if API fails.
    """
    try:
        compute = build("compute", "v1", credentials=credentials)
        response = compute.regions().list(project=project_id).execute()
        return [r["name"] for r in response.get("items", [])]
    except Exception as e:
        logger.warning("Failed to fetch regions, using fallback: %s", e)
        return ["us-central1", "asia-south1", "europe-west1"]


def get_enabled_apis(credentials, project_id):
    service = build("serviceusage", "v1", credentials=credentials)

    request = service.services().list(
        parent=f"projects/{project_id}", filter="state:ENABLED"
    )

    enabled = set()

    while request:
        response = request.execute()
        for svc in response.get("services", []):
            enabled.add(svc["config"]["name"])

        request = service.services().list_next(request, response)

    return enabled


# -------------------------------
# Main Scan Function
# -------------------------------


def run_gcp_scan(scan_job, account, regions=None):
    taken_time = TakenTime()
    taken_time.start()
    credentials = account.get_credentials() or {}
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

    # Resolve regions (user-defined OR auto-discovered)
    formatted_regions = [r for r in (regions or []) if r]
    if not formatted_regions:
        formatted_regions = _get_all_regions(creds, project_id)

    enabled_apis = get_enabled_apis(creds, project_id)
    total_units = calculate_gcp_total_units(len(formatted_regions))

    progress_tracker = ProgressTracker(total_units, scan_job)

    scan_job.log(f"Starting GCP scan for project: {project_id}")

    def _log(message, level="INFO"):
        scan_job.log(message, level=level)

    all_findings = []
    scanned_services = set()
    skipped_services = set()

    # -------------------------------
    # 🔹 PHASE 1: GLOBAL SCAN (RUN ONCE)
    # -------------------------------
    scan_job.log("Running global checks (project-level services)")

    global_context = GCPScanContext(
        credentials=creds,
        project_id=project_id,
        region=None,
        enabled_apis=enabled_apis,
    )

    try:
        global_result = run_all_checks(
            global_context,
            progress_tracker=progress_tracker,
            log=_log,
            stop_requested=lambda: scan_job.cancel_requested,
        )
    except Exception as exc:
        logger.error("Global scan failed: %s", exc)
        raise RuntimeError("Failed during global scan.") from exc

    for finding in global_result["findings"]:
        finding.setdefault("region", "GLOBAL")

    all_findings.extend(global_result["findings"])
    scanned_services.update(global_result["scanned_services"])
    skipped_services.update(global_result["skipped_services"])

    # -------------------------------
    # 🔹 PHASE 2: REGIONAL SCAN
    # -------------------------------
    for region in formatted_regions:
        if scan_job.cancel_requested:
            break

        scan_job.log(f"Scanning region: {region}")

        context = GCPScanContext(
            credentials=creds,
            project_id=project_id,
            region=region,
            zone=None,  # zone handled later inside checks if needed
            enabled_apis=enabled_apis,
        )

        try:
            result = run_all_checks(
                context,
                progress_tracker=progress_tracker,
                log=_log,
                stop_requested=lambda: scan_job.cancel_requested,
            )
        except Exception as exc:
            logger.error("Region scan failed for %s: %s", region, exc)
            continue

        # Attach region metadata properly
        for finding in result["findings"]:
            finding["region"] = region

        all_findings.extend(result["findings"])
        scanned_services.update(result["scanned_services"])
        skipped_services.update(result["skipped_services"])

    taken_time.finish()
    time_taken = taken_time.time_taken()
    scan_job.log(f"GCP scan completed in {time_taken}.")
    # -------------------------------
    # Save Findings
    # -------------------------------
    persisted = persist_findings(scan_job, all_findings)

    interrupted = scan_job.cancel_requested

    # -------------------------------
    # Summary
    # -------------------------------
    if interrupted:
        summary_message = "Scan interrupted by user."
        scan_job.log(summary_message, level="WARNING")

    elif not scanned_services:
        summary_message = "No active services detected; nothing was scanned."
        scan_job.log(summary_message, level="INFO")

    else:
        summary_message = f"Completed checks for {', '.join(scanned_services)}."
        scan_job.log(summary_message, level="SUCCESS")

        if skipped_services:
            scan_job.log(
                f"Skipped {', '.join(skipped_services)} due to execution errors.",
                level="WARNING",
            )

    return {
        "scanned_resources": persisted,
        "issues_found": len(all_findings),
        "scanned_services": list(scanned_services),
        "skipped_services": list(skipped_services),
        "interrupted": interrupted,
        "message": summary_message,
    }
