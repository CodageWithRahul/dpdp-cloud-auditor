import logging
from botocore.exceptions import ClientError
from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


# ---------------------------
# GET ALL TRAILS
# ---------------------------
def get_trails(client):
    try:
        return client.describe_trails()["trailList"]
    except ClientError as error:
        logger.warning("Unable to describe CloudTrail trails: %s", error)

        return [
            build_issue(
                "CloudTrail enumeration failed",
                "The scanner could not list CloudTrail trails.",
                "Ensure the scanner role has cloudtrail:DescribeTrails permission.",
                severity="HIGH",
            )
        ]


# ---------------------------
# CLOUDTRAIL NOT ENABLED
# ---------------------------
def check_cloudtrail_enabled(client):
    findings = []

    try:
        trails = client.describe_trails()["trailList"]
    except ClientError as error:
        logger.warning("Unable to check CloudTrail trails: %s", error)
        return findings

    if not trails:
        findings.append(
            build_issue(
                "CloudTrail not enabled",
                "No CloudTrail trails are configured in the account.",
                "Enable CloudTrail to log all API activity.",
                severity="CRITICAL",
            )
        )

    return findings


# ---------------------------
# MULTI REGION TRAIL CHECK
# ---------------------------
def check_multi_region(trails):
    findings = []

    for trail in trails:

        if not trail.get("IsMultiRegionTrail"):
            trail_name = trail["Name"]

            issue = build_issue(
                "CloudTrail not multi-region",
                "CloudTrail trail does not log events from all regions.",
                "Enable multi-region CloudTrail logging.",
                severity="MEDIUM",
            )

            issue.update(
                {"resource_type": "CloudTrail Trail", "resource_id": trail_name}
            )

            findings.append(issue)

    return findings


# ---------------------------
# LOG FILE VALIDATION CHECK
# ---------------------------
def check_log_validation(trails):
    findings = []

    for trail in trails:

        if not trail.get("LogFileValidationEnabled"):
            trail_name = trail["Name"]

            issue = build_issue(
                "CloudTrail log validation disabled",
                "Log file integrity validation is disabled.",
                "Enable log file validation to detect tampering.",
                severity="MEDIUM",
            )

            issue.update(
                {"resource_type": "CloudTrail Trail", "resource_id": trail_name}
            )

            findings.append(issue)

    return findings


# ---------------------------
# KMS ENCRYPTION CHECK
# ---------------------------
def check_kms_encryption(trails):
    findings = []

    for trail in trails:

        if not trail.get("KmsKeyId"):
            trail_name = trail["Name"]

            issue = build_issue(
                "CloudTrail logs not encrypted with KMS",
                "CloudTrail logs are not encrypted using a KMS key.",
                "Enable KMS encryption for CloudTrail logs.",
                severity="LOW",
            )

            issue.update(
                {"resource_type": "CloudTrail Trail", "resource_id": trail_name}
            )

            findings.append(issue)

    return findings


# ---------------------------
# MAIN RUNNER
# ---------------------------
def run(session):

    client = session.client("cloudtrail")
    findings = []

    try:
        trails = client.describe_trails()["trailList"]
    except ClientError as error:
        logger.warning("Unable to retrieve CloudTrail trails: %s", error)

        return [
            build_issue(
                "CloudTrail enumeration failed",
                "The scanner could not list CloudTrail trails.",
                "Grant cloudtrail:DescribeTrails permission.",
                severity="HIGH",
            )
        ]

    findings.extend(check_cloudtrail_enabled(client))
    findings.extend(check_multi_region(trails))
    findings.extend(check_log_validation(trails))
    findings.extend(check_kms_encryption(trails))

    return findings
