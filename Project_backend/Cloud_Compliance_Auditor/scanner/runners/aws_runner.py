import importlib
import logging
import pkgutil

from botocore.exceptions import ClientError
from django.utils.text import slugify

from scanner.service_registry.aws.aws_service_registry import get_global_services
from scanner.checks import aws as aws_checks_package

logger = logging.getLogger(__name__)

GLOBAL_AWS_SERVICES = get_global_services()
GLOBAL_SERVICES = GLOBAL_AWS_SERVICES
_GLOBAL_SERVICES = GLOBAL_AWS_SERVICES

_SERVICE_NAME_MAP = {
    "ec2_checks": "EC2",
    "security_group_checks": "EC2",
    "s3_checks": "S3",
    "iam_checks": "IAM",
    "cloudtrail_checks": "CloudTrail",
    "vpc_checks": "VPC",
    "snapshot_checks": "EC2",
    "rds_checks": "RDS",
    "lambda_checks": "Lambda",
    "eks_checks": "EKS",
    "cloudfront_checks": "CloudFront",
    "route53_checks": "Route53",
}


def _discover_check_modules():
    for finder, name, ispkg in pkgutil.iter_modules(aws_checks_package.__path__):
        if ispkg:
            continue
        yield importlib.import_module(f"{aws_checks_package.__name__}.{name}")


def _module_label(module):
    return module.__name__.split(".")[-1]


def _default_service(module):
    label = _module_label(module)
    if label in _SERVICE_NAME_MAP:
        return _SERVICE_NAME_MAP[label]
    if label.endswith("_checks"):
        return label.replace("_checks", "").upper()
    return label.upper()


def _build_check_id(module, finding):
    prefix = _module_label(module).replace("_checks", "").upper()
    title = finding.get("check_title") or finding.get("issue_type") or "unknown-check"
    slug = slugify(title).replace("-", "_").upper()
    slug = slug or "UNKNOWN"
    return f"{prefix}_{slug}"


def _has_ec2_instances(session):
    client = session.client("ec2")
    try:
        return bool(client.describe_instances(MaxResults=5).get("Reservations"))
    except ClientError as exc:
        logger.debug("EC2 describe_instances failed: %s", exc)
        return False


def _has_security_groups(session):
    client = session.client("ec2")
    try:
        return bool(client.describe_security_groups(MaxResults=5).get("SecurityGroups"))
    except ClientError as exc:
        logger.debug("EC2 describe_security_groups failed: %s", exc)
        return False


def _has_s3_buckets(session):
    client = session.client("s3")
    try:
        return bool(client.list_buckets().get("Buckets"))
    except ClientError as exc:
        logger.debug("S3 list_buckets failed: %s", exc)
        return False


def _has_iam_entities(session):
    client = session.client("iam")
    try:
        return bool(client.list_users(MaxItems=1).get("Users"))
    except ClientError as exc:
        logger.debug("IAM list_users failed: %s", exc)
        return False


def _has_cloudtrail_trails(session):
    client = session.client("cloudtrail")
    trails = client.describe_trails()["trailList"]
    return bool(trails)


def _has_rds_instances(session):
    client = session.client("rds")
    instances = client.describe_db_instances()["DBInstances"]
    return bool(instances)


def _has_vpcs(session):
    client = session.client("ec2")
    vpcs = client.describe_vpcs()["Vpcs"]
    return bool(vpcs)


def _has_snapshots(session):
    client = session.client("ec2")
    snaps = client.describe_snapshots(OwnerIds=["self"])["Snapshots"]
    return bool(snaps)


_SERVICE_RESOURCE_CHECKS = {
    "ec2_checks": _has_ec2_instances,
    "security_group_checks": _has_security_groups,
    "s3_checks": _has_s3_buckets,
    "iam_checks": _has_iam_entities,
    "cloudtrail_checks": _has_cloudtrail_trails,
    "rds_checks": _has_rds_instances,
    "vpc_checks": _has_vpcs,
    "snapshot_checks": _has_snapshots,
}


def _service_available(module, session):
    checker = _SERVICE_RESOURCE_CHECKS.get(_module_label(module))
    if not checker:
        return True
    return checker(session)


def run_all_checks(
    session,
    log=None,
    stop_requested=None,
    global_services_ran=None,
    include_services=None,
    exclude_services=None,
):
    findings = []
    service_outcomes = {}
    skipped_global_services = set()

    # Track global services already scanned
    if global_services_ran is None:
        global_services_ran = set()

    for module in _discover_check_modules():
        service_name = _default_service(module)

        if include_services is not None and service_name not in include_services:
            continue
        if exclude_services is not None and service_name in exclude_services:
            continue

        # -------------------------------------------------
        # SKIP GLOBAL SERVICES IF ALREADY SCANNED
        # -------------------------------------------------
        if service_name in _GLOBAL_SERVICES and service_name in global_services_ran:
            logger.debug(
                "Skipping global service %s because it was already scanned.",
                service_name,
            )
            skipped_global_services.add(service_name)
            service_outcomes.setdefault(service_name, "skipped_global")
            if log:
                log(
                    f"Skipping {service_name} checks because this is a global service "
                    "and it was already scanned earlier in this scan job."
                )
            continue

        if stop_requested and stop_requested():
            logger.info("AWS scan interrupted before running %s checks.", service_name)
            break

        if not _service_available(module, session):
            previous = service_outcomes.get(service_name)
            if previous != "scanned":
                service_outcomes[service_name] = "skipped"

            if log:
                log(
                    f"Skipping {service_name} checks because no resources were detected."
                )

            logger.debug(
                "Skipping %s because service cannot be detected",
                _module_label(module),
            )
            if service_name in _GLOBAL_SERVICES:
                global_services_ran.add(service_name)
            continue

        if log:
            log(f"Running {service_name} checks.")

        runner = getattr(module, "run", None)
        if not callable(runner):
            continue

        service_outcomes[service_name] = "scanned"

        logger.info("Running %s checks (%s).", service_name, module.__name__)

        raw_findings = runner(session) or []

        logger.info("%s returned %d findings", service_name, len(raw_findings))

        if log:
            log(f"{service_name} checks returned {len(raw_findings)} findings.")

        for finding in raw_findings:
            finding.setdefault("service_name", service_name)
            finding.setdefault("status", "FAIL")
            finding.setdefault(
                "check_title", finding.get("issue_type") or "Unnamed check"
            )
            finding.setdefault("check_id", _build_check_id(module, finding))

        findings.extend(raw_findings)

        # -------------------------------------------------
        # MARK GLOBAL SERVICE AS SCANNED
        # -------------------------------------------------
        if service_name in _GLOBAL_SERVICES:
            global_services_ran.add(service_name)

    scanned_services = [
        name for name, status in service_outcomes.items() if status == "scanned"
    ]

    skipped_services = [
        name for name, status in service_outcomes.items() if status == "skipped"
    ]

    return {
        "findings": findings,
        "scanned_services": scanned_services,
        "skipped_services": skipped_services,
        "skipped_global_services": sorted(skipped_global_services),
    }


def run_checks(
    session,
    log=None,
    stop_requested=None,
    include_services=None,
    exclude_services=None,
):
    return run_all_checks(
        session,
        log=log,
        stop_requested=stop_requested,
        global_services_ran=set(),
        include_services=include_services,
        exclude_services=exclude_services,
    )
