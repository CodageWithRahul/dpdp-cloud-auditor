import logging

from botocore.exceptions import ClientError

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


def check_iam_mfa(session):
    client = session.client("iam")
    findings = []

    try:
        users = client.list_users()["Users"]
    except ClientError as exc:
        logger.warning("Unable to list IAM users: %s", exc)
        return [
            build_issue(
                "IAM enumeration failed",
                "The scanner could not list IAM users.",
                "Grant iam:ListUsers to the scanner role.",
            )
        ]

    for user in users:
        username = user["UserName"]
        try:
            mfa_devices = client.list_mfa_devices(UserName=username)["MFADevices"]
        except ClientError as exc:
            logger.debug("Unable to read MFA devices for %s: %s", username, exc)
            continue

        if not mfa_devices:
            issue = build_issue(
                "IAM user missing MFA",
                "The IAM user is not enrolled in multi-factor authentication.",
                "Enable MFA for the user to comply with MFA requirements.",
            )
            issue.update({"resource_type": "IAM User", "resource_id": username})
            findings.append(issue)

    return findings


def run(session):
    return check_iam_mfa(session)
