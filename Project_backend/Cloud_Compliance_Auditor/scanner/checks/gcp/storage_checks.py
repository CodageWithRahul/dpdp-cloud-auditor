import logging

from google.api_core.exceptions import GoogleAPIError
from google.cloud import storage

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


def check_public_buckets(context):
    findings = []
    client = storage.Client(
        project=context.project_id, credentials=context.credentials
    )
    try:
        bucket_iterator = client.list_buckets()
    except GoogleAPIError as exc:
        logger.warning("Unable to list GCP storage buckets: %s", exc)
        return [
            build_issue(
                "Storage bucket enumeration failed",
                "The scanner could not list storage buckets.",
                "Grant storage.buckets.list to the GCP service account.",
            )
        ]

    for bucket in bucket_iterator:
        try:
            policy = bucket.get_iam_policy(requested_policy_version=3)
        except GoogleAPIError as exc:
            logger.debug("Unable to read IAM policy for %s: %s", bucket.name, exc)
            continue

        members = {
            member
            for binding in policy.bindings or []
            for member in getattr(binding, "members", [])
        }

        if "allUsers" in members or "allAuthenticatedUsers" in members:
            issue = build_issue(
                "Public storage bucket",
                "The bucket allows public access via IAM bindings.",
                "Remove public IAM members (allUsers/allAuthenticatedUsers) from the bucket policy.",
                severity="HIGH",
            )
            issue.update(
                {
                    "resource_type": "Storage Bucket",
                    "resource_id": bucket.name,
                }
            )
            findings.append(issue)

    return findings


def run(context):
    return check_public_buckets(context)
