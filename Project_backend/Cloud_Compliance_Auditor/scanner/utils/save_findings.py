import json
import logging

from django.apps import apps
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction

from scanner.models import Finding

logger = logging.getLogger(__name__)

_SCAN_RESULT_MODEL = None


def _get_scan_result_model():
    global _SCAN_RESULT_MODEL

    if _SCAN_RESULT_MODEL is None:
        _SCAN_RESULT_MODEL = apps.get_model("report", "ScanResult")

    return _SCAN_RESULT_MODEL


def _sanitize_raw_result(finding):
    sanitized = {}
    for key, value in finding.items():
        try:
            json.dumps(value, cls=DjangoJSONEncoder)
            sanitized[key] = value
        except TypeError:
            sanitized[key] = str(value)
    return sanitized


def persist_findings(scan_job, findings):
    if not findings:
        logger.debug("ScanJob %s produced no findings, skipping persistence.", scan_job.id)
        return 0

    ScanResult = _get_scan_result_model()
    logger.debug(
        "ScanJob %s is persisting %d findings (service=%s).",
        scan_job.id,
        len(findings),
        scan_job.cloud_account.provider,
    )

    finding_objs = []
    scan_result_objs = []

    for finding in findings:
        resource_type = finding.get("resource_type", "Cloud Resource")
        resource_id = finding.get("resource_id", "unknown")
        issue_type = finding.get("issue_type", "unknown issue")
        severity = finding.get("severity", "MEDIUM").upper()
        compliance_type = finding.get("compliance_type", "MISCONFIGURATION")
        description = finding.get("description", "")
        recommendation = finding.get("recommendation", "")

        region_value = finding.get("region")

        finding_objs.append(
            Finding(
                scan_job=scan_job,
                resource_type=resource_type,
                resource_id=resource_id,
                issue_type=issue_type,
                severity=severity,
                compliance_type=compliance_type,
                region=region_value,
                description=description,
                recommendation=recommendation,
            )
        )

        scan_result_objs.append(
            ScanResult(
                scan_job=scan_job,
                service_name=finding.get("service_name", scan_job.cloud_account.provider),
                check_id=finding.get("check_id", issue_type),
                check_title=finding.get("check_title", issue_type),
                status=finding.get("status", "FAIL").upper(),
                severity=severity,
                resource_id=resource_id,
                description=description,
                recommendation=recommendation,
                raw_result=_sanitize_raw_result(finding),
                region=region_value,
            )
        )

    try:
        with transaction.atomic():
            Finding.objects.bulk_create(finding_objs)
            ScanResult.objects.bulk_create(scan_result_objs)
    except Exception as exc:
        logger.error("Failed to persist findings for ScanJob %s: %s", scan_job.id, exc)
        raise

    logger.debug(
        "ScanJob %s persisted %d findings.", scan_job.id, len(finding_objs)
    )
    return len(finding_objs)
