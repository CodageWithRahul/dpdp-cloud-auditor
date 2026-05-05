import logging

from azure.identity import ClientSecretCredential

from scanner.runners.azure_runner import AzureScanContext, run_all_checks
from scanner.utils.save_findings import persist_findings

logger = logging.getLogger(__name__)


def run_azure_scan(scan_job, account, regions=None):
    credentials = account.get_credentials() or {}
    tenant_id = credentials.get("tenant_id")
    client_id = credentials.get("client_id")
    client_secret = credentials.get("client_secret")
    subscription_id = credentials.get("subscription_id")

    missing = [
        field
        for field, value in [
            ("tenant_id", tenant_id),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("subscription_id", subscription_id),
        ]
        if not value
    ]

    if missing:
        raise RuntimeError("Missing Azure credential fields: " + ", ".join(missing))

    credential = ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )

    context = AzureScanContext(credential=credential, subscription_id=subscription_id)

    formatted_regions = [region for region in (regions or []) if region]
    region_suffix = f" ({', '.join(formatted_regions)})" if formatted_regions else ""
    scan_job.log(f"Discovering available Azure services{region_suffix} before running checks.")

    def _log(message, level="INFO"):
        scan_job.log(message, level=level)

    region_tag = None
    if formatted_regions:
        region_tag = formatted_regions[0] if len(formatted_regions) == 1 else ", ".join(formatted_regions)

    try:
        result = run_all_checks(
            context, log=_log, stop_requested=lambda: scan_job.cancel_requested
        )
    except Exception as exc:
        logger.error("Azure runner raised an exception: %s", exc, exc_info=True)
        raise RuntimeError("Unable to complete Azure checks with current credentials") from exc

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
            summary_message = (
                f"Scan interrupted by user after running {', '.join(scanned)}{region_suffix}."
            )
        else:
            summary_message = (
                f"Scan interrupted by user before running Azure checks{region_suffix}."
            )
        scan_job.log(summary_message, level="WARNING")
    elif not scanned:
        summary_message = f"No active services detected; nothing was scanned for Azure{region_suffix}."
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
