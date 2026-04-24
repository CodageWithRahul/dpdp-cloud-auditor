from email import message
import logging
import re

import boto3
from botocore.exceptions import ClientError

from scanner.service_registry.aws.aws_service_registry import get_global_services
from scanner.runners.aws_runner import run_all_checks
from scanner.utils.save_findings import persist_findings

logger = logging.getLogger(__name__)


GLOBAL_AWS_SERVICES = get_global_services()
_GLOBAL_REGION_LABEL = "GLOBAL"

_RUNNING_RE = re.compile(r"^Running (?P<service>.+) checks\.$")
_SKIP_NO_RESOURCES_RE = re.compile(
    r"^Skipping (?P<service>.+) checks because no resources were detected\.$"
)
_SKIP_ALREADY_SCANNED_RE = re.compile(
    r"^Skipping (?P<service>.+) checks because this is a global service and it was already scanned earlier in this scan job\.$"
)
_CHECKS_RETURNED_RE = re.compile(r"^.+ checks returned \d+ findings\.$")


def _service_level_message(message: str, verb: str) -> str | None:
    """
    Map runner messages to one log per service.

    Returns None for messages that should not be persisted.
    """

    if not message:
        return None

    if _CHECKS_RETURNED_RE.match(message):
        return None

    match = _RUNNING_RE.match(message)
    if match:
        service = match.group("service")
        return f"{verb} {service} configuration."

    match = _SKIP_NO_RESOURCES_RE.match(message)
    if match:
        service = match.group("service")
        return f"Skipping {service} configuration because no resources were detected."

    match = _SKIP_ALREADY_SCANNED_RE.match(message)
    if match:
        service = match.group("service")
        return f"Skipping {service} configuration because this is a global service and it was already scanned."

    return message


class _RegionalSession:
    def __init__(self, base_session, region_name: str):
        self._base_session = base_session
        self._region_name = region_name

    @property
    def region_name(self):
        return self._region_name

    def client(self, service_name, *args, **kwargs):
        if kwargs.get("region_name") is None:
            kwargs["region_name"] = self._region_name
        return self._base_session.client(service_name, *args, **kwargs)

    def resource(self, service_name, *args, **kwargs):
        if kwargs.get("region_name") is None:
            kwargs["region_name"] = self._region_name
        return self._base_session.resource(service_name, *args, **kwargs)

    def __getattr__(self, item):
        return getattr(self._base_session, item)


def run_global_checks(session, log=None, stop_requested=None):
    return run_all_checks(
        session,
        log=log,
        stop_requested=stop_requested,
        include_services=set(GLOBAL_AWS_SERVICES),
    )


def run_regional_checks(session, log=None, stop_requested=None):
    return run_all_checks(
        session,
        log=log,
        stop_requested=stop_requested,
        exclude_services=set(GLOBAL_AWS_SERVICES),
    )


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

    base_session = boto3.Session(
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )

    findings = []
    scanned_services = []
    skipped_services = []
    skipped_global_services = []
    interrupted = False
    global_services_processed = set()
    global_region_name = target_regions[0]

    scan_job.log("Scan started for AWS account.", level="INFO")

    if scan_job.cancel_requested:
        interrupted = True
        scan_job.log("Scan interrupted by user before running global checks.", level="WARNING")
    else:
        scan_job.log("Running global AWS checks.", level="INFO")

        def _log_global(message: str):
            mapped = _service_level_message(message, verb="Scanning")
            if mapped:
                scan_job.log(mapped, level="INFO")

        try:
            result = run_global_checks(
                base_session,
                log=_log_global,
                stop_requested=lambda: scan_job.cancel_requested,
            )
        except ClientError as exc:
            logger.error(
                "AWS runner raised ClientError while running global checks: %s", exc
            )
            raise RuntimeError(
                f"Unable to complete AWS checks for {global_region_name} with current credentials"
            ) from exc

        for finding in result["findings"]:
            finding["region"] = _GLOBAL_REGION_LABEL
        findings.extend(result["findings"])
        scanned_services.extend(
            f"{name} ({_GLOBAL_REGION_LABEL})" for name in result["scanned_services"]
        )
        skipped_services.extend(
            f"{name} ({_GLOBAL_REGION_LABEL})" for name in result["skipped_services"]
        )

        global_services_processed = set(result["scanned_services"]) | set(
            result["skipped_services"]
        )

        scan_job.log("Global checks completed.", level="INFO")

        if scan_job.cancel_requested:
            interrupted = True
            scan_job.log(
                "Scan interrupted by user after finishing global checks.",
                level="WARNING",
            )

    skipped_global_service_labels = set()
    for region_name in target_regions:
        if interrupted:
            break
        if scan_job.cancel_requested:
            interrupted = True
            scan_job.log(
                f"Scan interrupted by user before checking {region_name}.",
                level="WARNING",
            )
            break

        session = _RegionalSession(base_session, region_name)
        scan_job.log(f"Scanning region {region_name}.", level="INFO")

        def _log_regional(message: str):
            mapped = _service_level_message(message, verb="Checking")
            if mapped:
                scan_job.log(mapped, level="INFO")

        try:
            result = run_regional_checks(
                session,
                log=_log_regional,
                stop_requested=lambda: scan_job.cancel_requested,
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

        if region_name != global_region_name and global_services_processed:
            for name in sorted(global_services_processed):
                label = f"{name} ({_GLOBAL_REGION_LABEL})"
                if label in skipped_global_service_labels:
                    continue
                skipped_global_service_labels.add(label)
                skipped_global_services.append(label)

        if scan_job.cancel_requested and not interrupted:
            interrupted = True
            scan_job.log(
                f"Scan interrupted by user after finishing {region_name}.",
                level="WARNING",
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
        if skipped_global_services:
            scan_job.log(
                f"Skipped {', '.join(skipped_global_services)} because those services are global and were already scanned.",
                level="INFO",
            )

    return {
        "scanned_resources": persisted,
        "issues_found": len(findings),
        "scanned_services": scanned_services,
        "skipped_services": skipped_services,
        "skipped_global_services": skipped_global_services,
        "interrupted": interrupted,
        "message": summary_message,
    }
