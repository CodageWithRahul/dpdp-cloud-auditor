import logging

from google.api_core.exceptions import GoogleAPIError
from google.cloud import bigquery

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 BigQuery is GLOBAL (datasets have location)
SCOPE = "GLOBAL"


# -------------------------------
# Helpers
# -------------------------------
def _is_public_access(entry):
    return entry in ("allUsers", "allAuthenticatedUsers")


def _contains_sensitive_data(dataset):
    labels = dataset.labels or {}
    dataset_id = dataset.dataset_id.lower()

    keywords = ["pii", "user", "customer", "personal", "sensitive"]

    # Check labels
    for k, v in labels.items():
        if any(x in k.lower() or x in str(v).lower() for x in keywords):
            return True

    # Check dataset name
    if any(x in dataset_id for x in keywords):
        return True

    return False


def _is_allowed_region(location):
    allowed = ["asia-south1", "asia-south2"]  # India regions
    return location in allowed


# -------------------------------
# Main Checks
# -------------------------------
def run(context):
    findings = []

    client = bigquery.Client(
        project=context.project_id, credentials=context.credentials
    )

    try:
        datasets = list(client.list_datasets())
    except GoogleAPIError as exc:
        logger.warning("Unable to list BigQuery datasets: %s", exc)
        return [
            build_issue(
                "BigQuery dataset enumeration failed",
                "Could not list datasets.",
                "Grant bigquery.datasets.list permission.",
            )
        ]

    for dataset_item in datasets:
        dataset = client.get_dataset(dataset_item.reference)
        dataset_id = dataset.dataset_id
        location = dataset.location

        # -------------------------------
        # 1. Public Access Check
        # -------------------------------
        access_entries = dataset.access_entries or []

        for entry in access_entries:
            if entry.entity_id in ("allUsers", "allAuthenticatedUsers"):
                findings.append(
                    {
                        **build_issue(
                            "Public BigQuery dataset",
                            f"Dataset '{dataset_id}' is publicly accessible.",
                            "Remove public access from dataset IAM.",
                            severity="HIGH",
                        ),
                        "resource_type": "BigQuery Dataset",
                        "resource_id": dataset_id,
                        "region": location,
                    }
                )

        # -------------------------------
        # 2. Missing Labels
        # -------------------------------
        if not dataset.labels:
            findings.append(
                {
                    **build_issue(
                        "Dataset missing labels",
                        f"Dataset '{dataset_id}' has no labels.",
                        "Add labels for classification (e.g., pii, internal).",
                        severity="LOW",
                    ),
                    "resource_type": "BigQuery Dataset",
                    "resource_id": dataset_id,
                    "region": location,
                }
            )

        # -------------------------------
        # 3. DPDP - Data Residency
        # -------------------------------
        if _contains_sensitive_data(dataset):
            if not _is_allowed_region(location):
                findings.append(
                    {
                        **build_issue(
                            "Potential personal data in non-compliant region",
                            f"Dataset '{dataset_id}' may contain sensitive data but is in '{location}'.",
                            "Move dataset to approved region (e.g., asia-south1).",
                            severity="HIGH",
                        ),
                        "resource_type": "BigQuery Dataset",
                        "resource_id": dataset_id,
                        "region": location,
                        "compliance": "DPDP",
                    }
                )

    return findings
