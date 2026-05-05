import logging
from datetime import datetime, timezone

from google.api_core.exceptions import GoogleAPIError
from google.cloud import secretmanager_v1

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 Secrets are GLOBAL
SCOPE = "GLOBAL"


# -------------------------------
# Helpers
# -------------------------------
def _get_secret_age_days(create_time):
    if not create_time:
        return 0
    created = create_time.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - created).days


def _has_labels(secret):
    return bool(getattr(secret, "labels", {}))


def _contains_sensitive_keywords(secret):
    name = secret.name.lower()
    labels = getattr(secret, "labels", {}) or {}

    keywords = ["password", "secret", "key", "token", "api", "auth"]

    if any(k in name for k in keywords):
        return True

    for k, v in labels.items():
        if any(x in k.lower() or x in str(v).lower() for x in keywords):
            return True

    return False


# -------------------------------
# Main Checks
# -------------------------------
def run(context):
    findings = []

    client = secretmanager_v1.SecretManagerServiceClient(
        credentials=context.credentials
    )

    parent = f"projects/{context.project_id}"

    try:
        secrets = client.list_secrets(request={"parent": parent})
    except GoogleAPIError as exc:
        logger.warning("Unable to list secrets: %s", exc)
        return [
            build_issue(
                "Secret enumeration failed",
                "Could not list secrets.",
                "Grant secretmanager.secrets.list permission.",
            )
        ]

    for secret in secrets:
        secret_id = secret.name.split("/")[-1]

        # -------------------------------
        # 1. Missing Labels
        # -------------------------------
        if not _has_labels(secret):
            findings.append(
                {
                    **build_issue(
                        "Secret missing labels",
                        f"Secret '{secret_id}' has no labels.",
                        "Add labels for classification and management.",
                        severity="LOW",
                    ),
                    "resource_type": "Secret",
                    "resource_id": secret_id,
                }
            )

        # -------------------------------
        # 2. Old Secret (not rotated)
        # -------------------------------
        age_days = _get_secret_age_days(secret.create_time)

        if age_days > 90:
            findings.append(
                {
                    **build_issue(
                        "Secret not rotated",
                        f"Secret '{secret_id}' is {age_days} days old.",
                        "Rotate secrets regularly.",
                        severity="MEDIUM",
                    ),
                    "resource_type": "Secret",
                    "resource_id": secret_id,
                }
            )

        # -------------------------------
        # 3. Too Many Versions
        # -------------------------------
        try:
            versions = client.list_secret_versions(request={"parent": secret.name})
            version_count = sum(1 for _ in versions)
        except Exception:
            version_count = 0

        if version_count > 10:
            findings.append(
                {
                    **build_issue(
                        "Too many secret versions",
                        f"Secret '{secret_id}' has {version_count} versions.",
                        "Remove unused or old secret versions.",
                        severity="LOW",
                    ),
                    "resource_type": "Secret",
                    "resource_id": secret_id,
                }
            )

        # -------------------------------
        # 4. Sensitive Secret (DPDP awareness)
        # -------------------------------
        if _contains_sensitive_keywords(secret):
            findings.append(
                {
                    **build_issue(
                        "Sensitive secret detected",
                        f"Secret '{secret_id}' may contain sensitive credentials.",
                        "Ensure strict access control and monitoring.",
                        severity="MEDIUM",
                    ),
                    "resource_type": "Secret",
                    "resource_id": secret_id,
                    "compliance": "DPDP",
                }
            )

    return findings
