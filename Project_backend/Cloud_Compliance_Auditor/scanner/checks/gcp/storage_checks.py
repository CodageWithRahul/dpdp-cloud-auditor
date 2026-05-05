import logging

from google.api_core.exceptions import GoogleAPIError
from google.cloud import storage

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 IMPORTANT: Storage is GLOBAL
SCOPE = "GLOBAL"


# -------------------------------
# Helpers
# -------------------------------
def _is_public_iam(bucket):
    try:
        policy = bucket.get_iam_policy(requested_policy_version=3)
    except GoogleAPIError:
        return False

    members = {
        member
        for binding in policy.bindings or []
        for member in getattr(binding, "members", [])
    }

    return "allUsers" in members or "allAuthenticatedUsers" in members


def _is_public_acl(bucket):
    try:
        acl = bucket.acl
        acl.reload()
    except Exception:
        return False

    for entry in acl:
        if entry["entity"] in ("allUsers", "allAuthenticatedUsers"):
            return True
    return False


def _is_uniform_access_disabled(bucket):
    iam_config = getattr(bucket, "iam_configuration", None)
    if not iam_config:
        return True

    uniform = getattr(iam_config, "uniform_bucket_level_access", None)
    return not getattr(uniform, "enabled", False)


def _is_versioning_disabled(bucket):
    return not getattr(bucket, "versioning_enabled", False)


def _is_logging_disabled(bucket):
    return not getattr(bucket, "logging", None)


def _is_google_managed_encryption(bucket):
    # If no KMS key → Google-managed encryption
    return not getattr(bucket, "kms_key_name", None)


def _is_allowed_region(location):
    if not location:
        return False

    location = location.lower()

    allowed_regions = [
        "asia-south1",  # Mumbai
        "asia-south2",  # Delhi
    ]

    return location in allowed_regions


def _contains_personal_data(bucket):
    labels = getattr(bucket, "labels", {}) or {}
    name = bucket.name.lower()

    keywords = ["pii", "personal", "user", "customer", "sensitive"]

    # Check labels
    for key, value in labels.items():
        if any(k in key.lower() or k in str(value).lower() for k in keywords):
            return True

    # Check name
    if any(k in name for k in keywords):
        return True

    return False


# -------------------------------
# Main Runner
# -------------------------------
def run(context):
    findings = []

    client = storage.Client(
        project=context.project_id,
        credentials=context.credentials,
    )

    try:
        buckets = client.list_buckets()
    except GoogleAPIError as exc:
        logger.warning("Unable to list GCP storage buckets: %s", exc)
        return [
            build_issue(
                "Storage bucket enumeration failed",
                "The scanner could not list storage buckets.",
                "Grant storage.buckets.list permission.",
            )
        ]

    for bucket in buckets:

        # -------------------------------
        # 1. Public via IAM
        # -------------------------------
        if _is_public_iam(bucket):
            findings.append(
                {
                    **build_issue(
                        "Public storage bucket (IAM)",
                        "Bucket is publicly accessible via IAM policy.",
                        "Remove allUsers/allAuthenticatedUsers from IAM bindings.",
                        severity="HIGH",
                    ),
                    "resource_type": "Storage Bucket",
                    "resource_id": bucket.name,
                }
            )

        # -------------------------------
        # 2. Public via ACL
        # -------------------------------
        if _is_public_acl(bucket):
            findings.append(
                {
                    **build_issue(
                        "Public storage bucket (ACL)",
                        "Bucket is publicly accessible via ACL.",
                        "Remove public ACL entries.",
                        severity="HIGH",
                    ),
                    "resource_type": "Storage Bucket",
                    "resource_id": bucket.name,
                }
            )

        # -------------------------------
        # 3. Uniform Access Disabled
        # -------------------------------
        if _is_uniform_access_disabled(bucket):
            findings.append(
                {
                    **build_issue(
                        "Uniform bucket-level access disabled",
                        "Bucket allows fine-grained ACLs instead of uniform access.",
                        "Enable uniform bucket-level access.",
                        severity="MEDIUM",
                    ),
                    "resource_type": "Storage Bucket",
                    "resource_id": bucket.name,
                }
            )

        # -------------------------------
        # 4. Versioning Disabled
        # -------------------------------
        if _is_versioning_disabled(bucket):
            findings.append(
                {
                    **build_issue(
                        "Bucket versioning disabled",
                        "Object versioning is not enabled.",
                        "Enable versioning to protect against accidental deletion.",
                        severity="LOW",
                    ),
                    "resource_type": "Storage Bucket",
                    "resource_id": bucket.name,
                }
            )

        # -------------------------------
        # 5. Logging Disabled
        # -------------------------------
        if _is_logging_disabled(bucket):
            findings.append(
                {
                    **build_issue(
                        "Bucket logging disabled",
                        "Access logging is not enabled.",
                        "Enable logging for audit visibility.",
                        severity="MEDIUM",
                    ),
                    "resource_type": "Storage Bucket",
                    "resource_id": bucket.name,
                }
            )

        # -------------------------------
        # 6. No CMEK (Customer-managed encryption)
        # -------------------------------
        if _is_google_managed_encryption(bucket):
            findings.append(
                {
                    **build_issue(
                        "Bucket not using CMEK",
                        "Bucket uses Google-managed encryption instead of customer-managed keys.",
                        "Use CMEK for sensitive data.",
                        severity="LOW",
                    ),
                    "resource_type": "Storage Bucket",
                    "resource_id": bucket.name,
                }
            )

        # -------------------------------
        # 7. DPDP - Data Residency Check
        # -------------------------------
        if _contains_personal_data(bucket):
            location = getattr(bucket, "location", "UNKNOWN")

            if not _is_allowed_region(location):
                findings.append(
                    {
                        **build_issue(
                            "Potential personal data stored outside allowed region",
                            f"Bucket may contain personal data but is located in '{location}'.",
                            "Move data to approved regions (e.g., asia-south1) or ensure compliance with DPDP regulations.",
                            severity="HIGH",
                        ),
                        "resource_type": "Storage Bucket",
                        "resource_id": bucket.name,
                        "location": location,
                        "compliance": "DPDP",
                    }
                )

    return findings
