import logging

from azure.core.exceptions import AzureError
from azure.mgmt.resource import ResourceManagementClient

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


def check_resource_group_tags(context):
    findings = []
    client = ResourceManagementClient(context.credential, context.subscription_id)
    try:
        groups = client.resource_groups.list()
    except AzureError as exc:
        logger.warning("Unable to list Azure resource groups: %s", exc)
        return [
            build_issue(
                "Resource group enumeration failed",
                "The scanner could not list Azure resource groups.",
                "Grant Microsoft.Resources/subscriptions/resourceGroups/read to the service principal.",
            )
        ]

    for group in groups:
        tags = group.tags or {}
        if tags.get("owner"):
            continue

        issue = build_issue(
            "Resource group missing owner tag",
            "Each resource group should have an owner tag for tracking.",
            "Add an owner tag to the resource group.",
            severity="LOW",
        )
        issue.update(
            {
                "resource_type": "Resource Group",
                "resource_id": group.name,
            }
        )
        findings.append(issue)

    return findings


def run(context):
    return check_resource_group_tags(context)
