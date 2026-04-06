import logging

from google.api_core.exceptions import GoogleAPIError
from google.cloud import compute_v1

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


def _has_public_ip(instance):
    for interface in getattr(instance, "network_interfaces", []) or []:
        for access in getattr(interface, "access_configs", []) or []:
            if getattr(access, "nat_ip", None) or getattr(access, "nat_i_p", None):
                return True
    return False


def check_public_instances(context):
    findings = []
    client = compute_v1.InstancesClient(credentials=context.credentials)
    try:
        pager = client.aggregated_list(project=context.project_id)
    except GoogleAPIError as exc:
        logger.warning("Unable to list Compute Engine instances: %s", exc)
        return [
            build_issue(
                "Compute instance enumeration failed",
                "The scanner could not list Compute Engine instances.",
                "Grant compute.instances.list to the GCP service account.",
            )
        ]

    for _, instances_scoped_list in pager:
        for instance in getattr(instances_scoped_list, "instances", []) or []:
            if not _has_public_ip(instance):
                continue

            issue = build_issue(
                "Public compute instance",
                "The instance has a public IP address and can be reached directly from the internet.",
                "Remove the external IP, place the instance behind a load balancer, or restrict access via firewall rules.",
                severity="MEDIUM",
            )
            issue.update(
                {
                    "resource_type": "Compute Instance",
                    "resource_id": instance.name,
                }
            )
            findings.append(issue)

    return findings


def run(context):
    return check_public_instances(context)
