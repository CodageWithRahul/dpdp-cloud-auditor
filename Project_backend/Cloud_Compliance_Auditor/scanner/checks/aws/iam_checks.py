import logging
from botocore.exceptions import ClientError
from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


# ---------------------------
# MFA CHECK (USER MFA)
# ---------------------------
def check_iam_mfa(client, users):
    findings = []

    for user in users:
        username = user["UserName"]

        try:
            mfa_devices = client.list_mfa_devices(UserName=username)["MFADevices"]
        except ClientError as error:
            logger.warning("Unable to read MFA devices for %s: %s", username, error)

            findings.append(
                build_issue(
                    "IAM MFA check failed",
                    f"Could not verify MFA status for user {username}.",
                    "Ensure scanner role has iam:ListMFADevices permission.",
                    severity="LOW",
                )
            )
            continue

        if not mfa_devices:
            issue = build_issue(
                "IAM user missing MFA",
                "The IAM user is not enrolled in multi-factor authentication.",
                "Enable MFA for all IAM users.",
                severity="HIGH",
            )
            issue.update({"resource_type": "IAM User", "resource_id": username})
            findings.append(issue)

    return findings


# ---------------------------
# ROOT MFA CHECK
# ---------------------------
def check_root_mfa(client):
    findings = []

    try:
        summary = client.get_account_summary()["SummaryMap"]
    except ClientError as error:
        logger.warning("Unable to retrieve account summary: %s", error)

        findings.append(
            build_issue(
                "Root MFA check failed",
                "Unable to verify root account MFA status.",
                "Ensure iam:GetAccountSummary permission is granted.",
                severity="LOW",
            )
        )
        return findings

    if summary.get("AccountMFAEnabled", 0) == 0:
        findings.append(
            build_issue(
                "Root MFA not enabled",
                "Root account does not have MFA enabled.",
                "Enable MFA on the root account immediately.",
                severity="CRITICAL",
            )
        )

    return findings


# ---------------------------
# CONSOLE USERS WITHOUT MFA
# ---------------------------
def check_console_access_without_mfa(client, users):
    findings = []

    for user in users:
        username = user["UserName"]

        try:
            client.get_login_profile(UserName=username)
        except ClientError as error:
            # If user has no console login profile this API throws error
            if "NoSuchEntity" in str(error):
                continue

            logger.warning("Unable to check console access for %s: %s", username, error)

            findings.append(
                build_issue(
                    "Console access check failed",
                    f"Could not verify console login profile for user {username}.",
                    "Ensure iam:GetLoginProfile permission is granted.",
                    severity="LOW",
                )
            )
            continue

        try:
            mfa_devices = client.list_mfa_devices(UserName=username)["MFADevices"]
        except ClientError as error:
            logger.warning("Unable to read MFA devices for %s: %s", username, error)

            findings.append(
                build_issue(
                    "Console MFA verification failed",
                    f"Could not verify MFA devices for user {username}.",
                    "Ensure iam:ListMFADevices permission is granted.",
                    severity="LOW",
                )
            )
            continue

        if not mfa_devices:
            issue = build_issue(
                "Console user without MFA",
                "User can log in to AWS console without MFA protection.",
                "Enable MFA for all console users.",
                severity="HIGH",
            )
            issue.update({"resource_type": "IAM User", "resource_id": username})
            findings.append(issue)

    return findings


# ---------------------------
# ACTIVE ACCESS KEYS CHECK
# ---------------------------
def check_active_access_keys(client, users):
    findings = []

    for user in users:
        username = user["UserName"]

        try:
            keys = client.list_access_keys(UserName=username)["AccessKeyMetadata"]
        except ClientError as error:
            logger.warning("Unable to list access keys for %s: %s", username, error)

            findings.append(
                build_issue(
                    "Access key check failed",
                    f"Could not retrieve access keys for user {username}.",
                    "Ensure iam:ListAccessKeys permission is granted.",
                    severity="LOW",
                )
            )
            continue

        for key in keys:
            if key["Status"] == "Active":
                issue = build_issue(
                    "Active IAM access key detected",
                    "Active access keys increase risk if leaked.",
                    "Rotate or remove unused access keys.",
                    severity="MEDIUM",
                )
                issue.update({"resource_type": "IAM User", "resource_id": username})
                findings.append(issue)

    return findings


# ---------------------------
# UNUSED USERS CHECK
# ---------------------------
def check_unused_users(users):
    findings = []

    for user in users:
        username = user["UserName"]

        if not user.get("PasswordLastUsed"):
            issue = build_issue(
                "Potential unused IAM user",
                "User shows no recent console login activity.",
                "Review and remove unused IAM users.",
                severity="LOW",
            )
            issue.update({"resource_type": "IAM User", "resource_id": username})
            findings.append(issue)

    return findings


# ---------------------------
# ROOT ACCESS KEYS CHECK
# ---------------------------
def check_root_access_keys(session):
    client = session.client("iam")

    try:
        summary = client.get_account_summary()["SummaryMap"]

        # This tells if root has access keys
        if summary.get("AccountAccessKeysPresent", 0) > 0:
            return [
                build_issue(
                    "Root access keys exist",
                    "Root account has active access keys.",
                    "Remove root access keys immediately.",
                    severity="CRITICAL",
                )
            ]

    except ClientError as error:
        logger.warning("Unable to check root access keys: %s", error)

    return []


# ---------------------------
# MAIN RUNNER
# ---------------------------
def run(session):
    client = session.client("iam")
    findings = []

    try:
        users = client.list_users()["Users"]
    except ClientError as error:
        logger.warning("Unable to list IAM users: %s", error)

        return [
            build_issue(
                "IAM enumeration failed",
                "The scanner could not list IAM users.",
                "Grant iam:ListUsers permission to the scanner role.",
                severity="HIGH",
            )
        ]

    findings.extend(check_iam_mfa(client, users))
    findings.extend(check_root_mfa(client))
    findings.extend(check_console_access_without_mfa(client, users))
    findings.extend(check_active_access_keys(client, users))
    findings.extend(check_unused_users(users))
    findings.extend(check_root_access_keys(session))

    return findings
