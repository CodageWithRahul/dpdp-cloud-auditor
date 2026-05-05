import logging

from google.api_core.exceptions import GoogleAPIError
from google.cloud import compute_v1

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 IMPORTANT: Mark this as REGIONAL
SCOPE = "REGIONAL"


# -------------------------------
# Helpers
# -------------------------------
def _has_public_ip(instance):
    for interface in getattr(instance, "network_interfaces", []) or []:
        for access in getattr(interface, "access_configs", []) or []:
            if getattr(access, "nat_ip", None):
                return True
    return False


def _is_shielded_enabled(instance):
    shielded = getattr(instance, "shielded_instance_config", None)
    if not shielded:
        return False
    return getattr(shielded, "enable_secure_boot", False)


def _has_os_login_enabled(instance):
    metadata = getattr(instance, "metadata", None)
    if not metadata:
        return False

    for item in getattr(metadata, "items", []) or []:
        if item.key == "enable-oslogin" and item.value == "TRUE":
            return True
    return False


def _has_full_access_scope(instance):
    for sa in getattr(instance, "service_accounts", []) or []:
        for scope in getattr(sa, "scopes", []) or []:
            if "cloud-platform" in scope:
                return True
    return False


def _has_labels(instance):
    return bool(getattr(instance, "labels", {}))


# -------------------------------
# Main Checks
# -------------------------------
def run(context):
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
                "Grant compute.instances.list to the service account.",
            )
        ]

    for zone, instances_scoped_list in pager:
        instances = getattr(instances_scoped_list, "instances", []) or []

        for instance in instances:
            zone_name = zone.split("/")[-1] if zone else None

            # -------------------------------
            # 1. Public IP Check
            # -------------------------------
            if _has_public_ip(instance):
                findings.append(
                    {
                        **build_issue(
                            "Public compute instance",
                            "Instance has a public IP and is exposed to the internet.",
                            "Remove external IP or restrict via firewall.",
                            severity="HIGH",
                        ),
                        "resource_type": "Compute Instance",
                        "resource_id": instance.name,
                        "zone": zone_name,
                    }
                )

            # -------------------------------
            # 2. Shielded VM Check
            # -------------------------------
            if not _is_shielded_enabled(instance):
                findings.append(
                    {
                        **build_issue(
                            "Shielded VM not enabled",
                            "Instance is not using Shielded VM features.",
                            "Enable Shielded VM for better security.",
                            severity="MEDIUM",
                        ),
                        "resource_type": "Compute Instance",
                        "resource_id": instance.name,
                        "zone": zone_name,
                    }
                )

            # -------------------------------
            # 3. OS Login Check
            # -------------------------------
            if not _has_os_login_enabled(instance):
                findings.append(
                    {
                        **build_issue(
                            "OS Login not enabled",
                            "Instance does not enforce OS Login.",
                            "Enable OS Login for centralized access control.",
                            severity="MEDIUM",
                        ),
                        "resource_type": "Compute Instance",
                        "resource_id": instance.name,
                        "zone": zone_name,
                    }
                )

            # -------------------------------
            # 4. Service Account Over-permission
            # -------------------------------
            if _has_full_access_scope(instance):
                findings.append(
                    {
                        **build_issue(
                            "Overly permissive service account",
                            "Instance uses full cloud-platform access scope.",
                            "Restrict service account scopes to least privilege.",
                            severity="HIGH",
                        ),
                        "resource_type": "Compute Instance",
                        "resource_id": instance.name,
                        "zone": zone_name,
                    }
                )

            # -------------------------------
            # 5. Missing Labels
            # -------------------------------
            if not _has_labels(instance):
                findings.append(
                    {
                        **build_issue(
                            "Instance missing labels",
                            "Instance does not have labels for organization.",
                            "Add labels for better management and governance.",
                            severity="LOW",
                        ),
                        "resource_type": "Compute Instance",
                        "resource_id": instance.name,
                        "zone": zone_name,
                    }
                )

    return findings
