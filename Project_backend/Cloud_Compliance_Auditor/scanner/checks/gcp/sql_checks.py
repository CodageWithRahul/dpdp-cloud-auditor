import logging

from google.api_core.exceptions import GoogleAPIError
from googleapiclient.discovery import build

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 Cloud SQL is REGIONAL
SCOPE = "REGIONAL"


# -------------------------------
# Helpers
# -------------------------------
def _has_public_ip(instance):
    ip_addresses = instance.get("ipAddresses", [])
    for ip in ip_addresses:
        if ip.get("type") == "PRIMARY":
            return True
    return False


def _is_backup_disabled(instance):
    settings = instance.get("settings", {})
    backup = settings.get("backupConfiguration", {})
    return not backup.get("enabled", False)


def _is_ssl_not_enforced(instance):
    settings = instance.get("settings", {})
    ip_config = settings.get("ipConfiguration", {})
    return not ip_config.get("requireSsl", False)


def _is_cmek_not_used(instance):
    disk_encryption = instance.get("diskEncryptionConfiguration", {})
    return not disk_encryption.get("kmsKeyName")


def _contains_personal_data(instance):
    # Heuristic (like storage)
    name = instance.get("name", "").lower()
    labels = instance.get("settings", {}).get("userLabels", {}) or {}

    keywords = ["pii", "user", "customer", "personal", "sensitive"]

    for k, v in labels.items():
        if any(x in k.lower() or x in str(v).lower() for x in keywords):
            return True

    if any(x in name for x in keywords):
        return True

    return False


def _is_allowed_region(region):
    allowed = ["asia-south1", "asia-south2"]  # India regions
    return region in allowed


# -------------------------------
# Main Checks
# -------------------------------
def run(context):
    findings = []

    try:
        sqladmin = build("sqladmin", "v1beta4", credentials=context.credentials)

        instances = sqladmin.instances().list(project=context.project_id).execute()
    except Exception as exc:
        logger.warning("Unable to list Cloud SQL instances: %s", exc)
        return [
            build_issue(
                "Cloud SQL enumeration failed",
                "Could not list SQL instances.",
                "Grant cloudsql.instances.list permission.",
            )
        ]

    for instance in instances.get("items", []):
        instance_name = instance.get("name")
        region = instance.get("region")

        # -------------------------------
        # 1. Public IP
        # -------------------------------
        if _has_public_ip(instance):
            findings.append(
                {
                    **build_issue(
                        "Cloud SQL instance has public IP",
                        f"Instance '{instance_name}' is publicly accessible.",
                        "Disable public IP and use private connectivity.",
                        severity="HIGH",
                    ),
                    "resource_type": "Cloud SQL",
                    "resource_id": instance_name,
                    "region": region,
                }
            )

        # -------------------------------
        # 2. Backup Disabled
        # -------------------------------
        if _is_backup_disabled(instance):
            findings.append(
                {
                    **build_issue(
                        "Cloud SQL backup disabled",
                        f"Instance '{instance_name}' has no backups enabled.",
                        "Enable automated backups.",
                        severity="MEDIUM",
                    ),
                    "resource_type": "Cloud SQL",
                    "resource_id": instance_name,
                    "region": region,
                }
            )

        # -------------------------------
        # 3. SSL Not Enforced
        # -------------------------------
        if _is_ssl_not_enforced(instance):
            findings.append(
                {
                    **build_issue(
                        "SSL not enforced on Cloud SQL",
                        f"Instance '{instance_name}' does not enforce SSL connections.",
                        "Enable requireSsl for secure connections.",
                        severity="HIGH",
                    ),
                    "resource_type": "Cloud SQL",
                    "resource_id": instance_name,
                    "region": region,
                }
            )

        # -------------------------------
        # 4. No CMEK
        # -------------------------------
        if _is_cmek_not_used(instance):
            findings.append(
                {
                    **build_issue(
                        "Cloud SQL not using CMEK",
                        f"Instance '{instance_name}' uses Google-managed encryption.",
                        "Use CMEK for sensitive workloads.",
                        severity="LOW",
                    ),
                    "resource_type": "Cloud SQL",
                    "resource_id": instance_name,
                    "region": region,
                }
            )

        # -------------------------------
        # 5. DPDP - Data Residency
        # -------------------------------
        if _contains_personal_data(instance):
            if not _is_allowed_region(region):
                findings.append(
                    {
                        **build_issue(
                            "Potential personal data in non-compliant region",
                            f"Instance '{instance_name}' may contain personal data but is in '{region}'.",
                            "Move to approved region (e.g., asia-south1).",
                            severity="HIGH",
                        ),
                        "resource_type": "Cloud SQL",
                        "resource_id": instance_name,
                        "region": region,
                        "compliance": "DPDP",
                    }
                )

    return findings
