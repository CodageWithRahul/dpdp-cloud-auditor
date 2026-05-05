import logging
from datetime import datetime, timezone

from google.api_core.exceptions import GoogleAPIError
from google.cloud import kms_v1

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 KMS is REGIONAL
SCOPE = "REGIONAL"


# -------------------------------
# Helpers
# -------------------------------
def _is_rotation_disabled(key):
    return not key.rotation_period


def _get_key_age_days(create_time):
    if not create_time:
        return 0
    created = create_time.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - created).days


# -------------------------------
# Main Checks
# -------------------------------
def run(context):
    findings = []

    client = kms_v1.KeyManagementServiceClient(credentials=context.credentials)

    parent = f"projects/{context.project_id}/locations/-"

    try:
        key_rings = client.list_key_rings(request={"parent": parent})
    except GoogleAPIError as exc:
        logger.warning("Unable to list key rings: %s", exc)
        return [
            build_issue(
                "KMS enumeration failed",
                "Could not list KMS key rings.",
                "Grant cloudkms.keyRings.list permission.",
            )
        ]

    for kr in key_rings:
        kr_name = kr.name

        try:
            keys = client.list_crypto_keys(request={"parent": kr_name})
        except Exception:
            continue

        for key in keys:
            key_id = key.name.split("/")[-1]

            # -------------------------------
            # 1. Rotation Disabled
            # -------------------------------
            if _is_rotation_disabled(key):
                findings.append(
                    {
                        **build_issue(
                            "KMS key rotation disabled",
                            f"Key '{key_id}' does not have rotation enabled.",
                            "Enable automatic key rotation.",
                            severity="MEDIUM",
                        ),
                        "resource_type": "KMS Key",
                        "resource_id": key_id,
                    }
                )

            # -------------------------------
            # 2. Old Key
            # -------------------------------
            age_days = _get_key_age_days(key.create_time)

            if age_days > 365:
                findings.append(
                    {
                        **build_issue(
                            "Old KMS key",
                            f"Key '{key_id}' is {age_days} days old.",
                            "Review and rotate old keys.",
                            severity="LOW",
                        ),
                        "resource_type": "KMS Key",
                        "resource_id": key_id,
                    }
                )

    return findings
