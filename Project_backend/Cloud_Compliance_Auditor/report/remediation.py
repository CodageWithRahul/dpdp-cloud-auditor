from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RemediationTemplate:
    title: str
    risk: str
    steps: list[str]
    difficulty: str = "Medium"
    estimated_time: str = "5 min"

    def as_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "risk": self.risk,
            "steps": list(self.steps),
            "difficulty": self.difficulty,
            "estimated_time": self.estimated_time,
        }


# NOTE: Keys should match the scanner's check identifiers stored in ScanResult.check_id.
# Keep this mapping in the report app to avoid coupling scanner core logic to UI needs.
REMEDIATION_BY_CHECK_ID: dict[str, RemediationTemplate] = {
    "default-allow-ssh": RemediationTemplate(
        title="Restrict SSH Access",
        risk="Public SSH access enables attackers to attempt brute-force login and exploit exposed services.",
        steps=[
            "Go to VPC firewall rules",
            "Edit the SSH-allow rule (for example, 'default-allow-ssh')",
            "Restrict source IP ranges to trusted networks only",
            "Remove overly broad '0.0.0.0/0' rules where possible",
        ],
        difficulty="Easy",
        estimated_time="2 min",
    ),
    "default-allow-rdp": RemediationTemplate(
        title="Restrict RDP Access",
        risk="Public RDP exposure increases the likelihood of credential stuffing, brute-force attacks, and remote compromise.",
        steps=[
            "Go to VPC firewall rules",
            "Edit the RDP-allow rule (for example, 'default-allow-rdp')",
            "Restrict source IP ranges to trusted networks only",
            "Prefer VPN / bastion access over public exposure",
        ],
        difficulty="Easy",
        estimated_time="3 min",
    ),
    "default-allow-icmp": RemediationTemplate(
        title="Restrict ICMP Exposure",
        risk="Public ICMP can help attackers discover assets and perform network reconnaissance.",
        steps=[
            "Go to VPC firewall rules",
            "Edit the ICMP-allow rule (for example, 'default-allow-icmp')",
            "Restrict source IP ranges to trusted networks only",
            "Disable ICMP from the internet if it is not required",
        ],
        difficulty="Easy",
        estimated_time="2 min",
    ),
}


def build_remediation(
    *,
    check_id: str | None,
    check_title: str | None = None,
    service_name: str | None = None,
) -> dict[str, Any] | None:
    """
    Return a structured remediation object for a given check_id.

    - Returns None when a mapping is not available (keeps API non-breaking).
    - Uses a small fallback template so the frontend can still render something actionable.
    """

    normalized = (check_id or "").strip()
    if not normalized:
        return None

    template = REMEDIATION_BY_CHECK_ID.get(normalized)
    if template:
        return template.as_dict()

    # Generic fallback: keeps shape stable while we expand mappings over time.
    if check_title:
        title = f"Remediate: {check_title}"
    else:
        title = f"Remediate check: {normalized}"

    service_hint = f" in {service_name}" if service_name else ""
    return {
        "title": title,
        "risk": f"This configuration issue may increase risk exposure{service_hint}.",
        "steps": [
            "Review the failing resource configuration",
            "Apply least-privilege and restrict public access where possible",
            "Re-run the scan to confirm remediation",
        ],
        "difficulty": "Medium",
        "estimated_time": "5-10 min",
    }

