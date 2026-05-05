import logging
from datetime import datetime, timezone

from google.api_core.exceptions import GoogleAPIError
from google.cloud import iam_credentials_v1
from googleapiclient.discovery import build

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 IAM is GLOBAL
SCOPE = "GLOBAL"


# -------------------------------
# Helpers
# -------------------------------
def _is_public_member(member):
    return member in ("allUsers", "allAuthenticatedUsers")


def _is_high_privilege_role(role):
    return role in ("roles/owner", "roles/editor")


# -------------------------------
# 1. IAM Policy Checks
# -------------------------------
def check_iam_policy(context):
    findings = []

    try:
        crm = build("cloudresourcemanager", "v1", credentials=context.credentials)
        policy = (
            crm.projects().getIamPolicy(resource=context.project_id, body={}).execute()
        )
    except Exception as exc:
        logger.warning("Unable to fetch IAM policy: %s", exc)
        return [
            build_issue(
                "IAM policy fetch failed",
                "Could not retrieve IAM policy for project.",
                "Ensure resourcemanager.projects.getIamPolicy permission.",
            )
        ]

    for binding in policy.get("bindings", []):
        role = binding.get("role", "")
        members = binding.get("members", [])

        for member in members:

            # -------------------------------
            # Public Access Check
            # -------------------------------
            if _is_public_member(member):
                findings.append(
                    {
                        **build_issue(
                            "Public IAM access",
                            f"Role '{role}' is assigned to public member '{member}'.",
                            "Remove public members from IAM policy.",
                            severity="HIGH",
                        ),
                        "resource_type": "IAM Policy",
                        "resource_id": context.project_id,
                    }
                )

            # -------------------------------
            # High Privilege Role Check
            # -------------------------------
            if _is_high_privilege_role(role):
                findings.append(
                    {
                        **build_issue(
                            "High privilege IAM role assigned",
                            f"Member '{member}' has role '{role}'.",
                            "Use least privilege roles instead of Owner/Editor.",
                            severity="HIGH",
                        ),
                        "resource_type": "IAM Policy",
                        "resource_id": context.project_id,
                    }
                )

    return findings


# -------------------------------
# 2. Service Account Key Checks
# -------------------------------
def check_service_account_keys(context):
    findings = []

    try:
        iam_service = build("iam", "v1", credentials=context.credentials)

        sa_list = (
            iam_service.projects()
            .serviceAccounts()
            .list(name=f"projects/{context.project_id}")
            .execute()
        )
    except Exception as exc:
        logger.warning("Unable to list service accounts: %s", exc)
        return []

    for sa in sa_list.get("accounts", []):
        sa_email = sa.get("email")

        try:
            keys = (
                iam_service.projects()
                .serviceAccounts()
                .keys()
                .list(name=sa["name"])
                .execute()
            )
        except Exception:
            continue

        for key in keys.get("keys", []):
            key_type = key.get("keyType", "")

            # Only consider USER_MANAGED keys (risk)
            if key_type != "USER_MANAGED":
                continue

            create_time = key.get("validAfterTime")
            if create_time:
                created_at = datetime.fromisoformat(create_time.replace("Z", "+00:00"))
                age_days = (datetime.now(timezone.utc) - created_at).days
            else:
                age_days = 0

            # -------------------------------
            # Old Key Check
            # -------------------------------
            if age_days > 90:
                findings.append(
                    {
                        **build_issue(
                            "Old service account key",
                            f"Service account '{sa_email}' has a key older than {age_days} days.",
                            "Rotate or delete old keys.",
                            severity="HIGH",
                        ),
                        "resource_type": "Service Account",
                        "resource_id": sa_email,
                    }
                )

            # -------------------------------
            # Any User-managed Key Warning
            # -------------------------------
            findings.append(
                {
                    **build_issue(
                        "Service account uses user-managed key",
                        f"Service account '{sa_email}' uses a long-lived key.",
                        "Use Workload Identity or short-lived tokens instead.",
                        severity="MEDIUM",
                    ),
                    "resource_type": "Service Account",
                    "resource_id": sa_email,
                }
            )

    return findings


# -------------------------------
# 3. Too Many Service Accounts
# -------------------------------
def check_service_account_count(context):
    findings = []

    try:
        iam_service = build("iam", "v1", credentials=context.credentials)

        sa_list = (
            iam_service.projects()
            .serviceAccounts()
            .list(name=f"projects/{context.project_id}")
            .execute()
        )
    except Exception:
        return []

    accounts = sa_list.get("accounts", [])
    count = len(accounts)

    if count > 20:
        findings.append(
            {
                **build_issue(
                    "Too many service accounts",
                    f"Project has {count} service accounts.",
                    "Review and remove unused service accounts.",
                    severity="LOW",
                ),
                "resource_type": "Service Accounts",
                "resource_id": context.project_id,
            }
        )

    return findings


# -------------------------------
# Main Runner
# -------------------------------
def run(context):
    findings = []

    findings.extend(check_iam_policy(context))
    findings.extend(check_service_account_keys(context))
    findings.extend(check_service_account_count(context))

    return findings
