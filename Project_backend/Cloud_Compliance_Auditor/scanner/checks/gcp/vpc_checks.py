import logging

from google.api_core.exceptions import GoogleAPIError
from google.cloud import compute_v1

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 Network is REGIONAL (firewalls tied to network but effectively global per project)
SCOPE = "GLOBAL"


# -------------------------------
# Helpers
# -------------------------------
def _is_open_to_world(source_ranges):
    return "0.0.0.0/0" in (source_ranges or [])


def _extract_ports(rule):
    ports = []

    for allowed in getattr(rule, "allowed", []) or []:
        for port in getattr(allowed, "ports", []) or []:
            ports.append(port)

    return ports


def _is_ssh_open(rule):
    ports = _extract_ports(rule)
    return "22" in ports


def _is_rdp_open(rule):
    ports = _extract_ports(rule)
    return "3389" in ports


def _is_all_ports_open(rule):
    for allowed in getattr(rule, "allowed", []) or []:
        if not getattr(allowed, "ports", None):
            return True  # means ALL ports
    return False


# -------------------------------
# Firewall Checks
# -------------------------------
def check_firewall_rules(context):
    findings = []

    client = compute_v1.FirewallsClient(credentials=context.credentials)

    try:
        rules = client.list(project=context.project_id)
    except GoogleAPIError as exc:
        logger.warning("Unable to list firewall rules: %s", exc)
        return [
            build_issue(
                "Firewall enumeration failed",
                "Could not list firewall rules.",
                "Grant compute.firewalls.list permission.",
            )
        ]

    for rule in rules:

        source_ranges = getattr(rule, "source_ranges", []) or []

        # Only check INGRESS rules
        if rule.direction != "INGRESS":
            continue

        # -------------------------------
        # 1. Open to World
        # -------------------------------
        if _is_open_to_world(source_ranges):

            # -------------------------------
            # SSH Open
            # -------------------------------
            if _is_ssh_open(rule):
                findings.append(
                    {
                        **build_issue(
                            "SSH open to the internet",
                            f"Firewall rule '{rule.name}' allows SSH (22) from 0.0.0.0/0.",
                            "Restrict SSH access to specific IP ranges.",
                            severity="HIGH",
                        ),
                        "resource_type": "Firewall Rule",
                        "resource_id": rule.name,
                    }
                )

            # -------------------------------
            # RDP Open
            # -------------------------------
            if _is_rdp_open(rule):
                findings.append(
                    {
                        **build_issue(
                            "RDP open to the internet",
                            f"Firewall rule '{rule.name}' allows RDP (3389) from 0.0.0.0/0.",
                            "Restrict RDP access or disable it.",
                            severity="HIGH",
                        ),
                        "resource_type": "Firewall Rule",
                        "resource_id": rule.name,
                    }
                )

            # -------------------------------
            # All Ports Open
            # -------------------------------
            if _is_all_ports_open(rule):
                findings.append(
                    {
                        **build_issue(
                            "All ports open to the internet",
                            f"Firewall rule '{rule.name}' allows all ports from 0.0.0.0/0.",
                            "Restrict allowed ports and IP ranges.",
                            severity="CRITICAL",
                        ),
                        "resource_type": "Firewall Rule",
                        "resource_id": rule.name,
                    }
                )

            # -------------------------------
            # Generic Open Rule
            # -------------------------------
            if not (
                _is_ssh_open(rule) or _is_rdp_open(rule) or _is_all_ports_open(rule)
            ):
                findings.append(
                    {
                        **build_issue(
                            "Firewall open to the internet",
                            f"Firewall rule '{rule.name}' allows traffic from 0.0.0.0/0.",
                            "Restrict access to trusted IP ranges.",
                            severity="MEDIUM",
                        ),
                        "resource_type": "Firewall Rule",
                        "resource_id": rule.name,
                    }
                )

    return findings


# -------------------------------
# Main Runner
# -------------------------------
def run(context):
    findings = []

    findings.extend(check_firewall_rules(context))

    return findings
