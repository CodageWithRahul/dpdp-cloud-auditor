import logging

from azure.core.exceptions import AzureError
from azure.mgmt.resource import ResourceManagementClient

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


def check_resources_owner_tag(context):
    findings = []
    client = ResourceManagementClient(context.credential, context.subscription_id)
    try:
        resources = client.resources.list()
    except AzureError as exc:
        logger.warning("Unable to list Azure resources: %s", exc)
        return [
            build_issue(
                "Resource enumeration failed",
                "The scanner could not enumerate Azure resources.",
                "Grant Microsoft.Resources/subscriptions/resources/read to the service principal.",
            )
        ]

    for resource in resources:
        tags = resource.tags or {}
        if tags.get("owner"):
            continue

        issue = build_issue(
            "Resource missing owner tag",
            "Resources should include an owner tag for governance.",
            "Add an owner tag to the resource in Azure.",
            severity="LOW",
        )
        issue.update(
            {
                "resource_type": resource.type or "Azure Resource",
                "resource_id": resource.id,
            }
        )
        findings.append(issue)

    return findings


def run(context):
    return check_resources_owner_tag(context)
