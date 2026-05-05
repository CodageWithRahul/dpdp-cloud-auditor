import logging

from googleapiclient.discovery import build

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 Regional service
SCOPE = "REGIONAL"


def run(context):
    findings = []

    try:
        service = build("cloudfunctions", "v1", credentials=context.credentials)

        parent = f"projects/{context.project_id}/locations/{context.region}"

        response = (
            service.projects().locations().functions().list(parent=parent).execute()
        )

    except Exception as exc:
        logger.warning("Unable to list Cloud Functions: %s", exc)
        return []

    functions = response.get("functions", [])

    for fn in functions:
        name = fn.get("name", "").split("/")[-1]

        https_trigger = fn.get("httpsTrigger")

        # -------------------------------
        # 1. Public Function Check
        # -------------------------------
        if https_trigger:
            # If HTTPS trigger exists → may be public
            findings.append(
                {
                    **build_issue(
                        "Public Cloud Function",
                        f"Function '{name}' is accessible via HTTP trigger.",
                        "Restrict access using IAM or authentication.",
                        severity="HIGH",
                    ),
                    "resource_type": "Cloud Function",
                    "resource_id": name,
                    "region": context.region,
                }
            )

    return findings
