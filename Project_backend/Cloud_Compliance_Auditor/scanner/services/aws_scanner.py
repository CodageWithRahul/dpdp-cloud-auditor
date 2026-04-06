import logging

import boto3
from botocore.exceptions import ClientError

from scanner.runners.aws_runner import run_all_checks
from scanner.utils.save_findings import persist_findings

logger = logging.getLogger(__name__)


def run_aws_scan(scan_job, account, regions=None):
    credentials = account.credentials or {}
    access_key = credentials.get("access_key")
    secret_key = credentials.get("secret_key")
    default_region = credentials.get("region") or "us-east-1"

    target_regions = [region for region in regions or [] if region]
    if not target_regions:
        target_regions = [default_region]

    # remove duplicates while preserving order
    seen = set()
    unique_regions = []
    for region in target_regions:
        if region not in seen:
            seen.add(region)
            unique_regions.append(region)

    target_regions = unique_regions

    if not access_key or not secret_key:
        raise RuntimeError("Missing AWS credentials for this account.")

    findings = []
    scanned_services = []
    skipped_services = []
    interrupted = False

    for region_name in target_regions:
        if scan_job.cancel_requested:
            interrupted = True
            scan_job.log(
                f"Scan interrupted by user before checking {region_name}.", level="WARNING"
            )
            break
        session = boto3.Session(
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region_name,
        )

        def _log(message, level="INFO"):
            scan_job.log(f"[{region_name}] {message}", level=level)

        scan_job.log(f"Discovering AWS services in {region_name} before running checks.")

        try:
            result = run_all_checks(
                session, log=_log, stop_requested=lambda: scan_job.cancel_requested
            )
        except ClientError as exc:
            logger.error("AWS runner raised ClientError in %s: %s", region_name, exc)
            raise RuntimeError(
                f"Unable to complete AWS checks for {region_name} with current credentials"
            ) from exc

        for finding in result["findings"]:
            finding.setdefault("region", region_name)
        findings.extend(result["findings"])
        scanned_services.extend(
            f"{name} ({region_name})" for name in result["scanned_services"]
        )
        skipped_services.extend(
            f"{name} ({region_name})" for name in result["skipped_services"]
        )

        if scan_job.cancel_requested and not interrupted:
            interrupted = True
            scan_job.log(
                f"Scan interrupted by user after finishing {region_name}.", level="WARNING"
            )
            break

    persisted = persist_findings(scan_job, findings)

    if interrupted:
        if scanned_services:
            summary_message = (
                f"Scan interrupted by user after running {', '.join(scanned_services)}."
            )
        else:
            summary_message = "Scan interrupted by user before any checks could run."
        scan_job.log(summary_message, level="WARNING")
    elif not scanned_services:
        summary_message = "No active services detected; nothing was scanned."
        scan_job.log(summary_message, level="INFO")
    else:
        summary_message = f"Completed checks for {', '.join(scanned_services)}."
        scan_job.log(summary_message, level="SUCCESS")
        if skipped_services:
            scan_job.log(
                f"Skipped {', '.join(skipped_services)} because no resources were detected.",
                level="INFO",
            )

    return {
        "scanned_resources": persisted,
        "issues_found": len(findings),
        "scanned_services": scanned_services,
        "skipped_services": skipped_services,
        "interrupted": interrupted,
        "message": summary_message,
    }
