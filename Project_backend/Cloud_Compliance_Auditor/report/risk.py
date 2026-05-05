from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable

from .remediation import build_remediation


SEVERITY_WEIGHT: dict[str, int] = {
    "CRITICAL": 10,
    "HIGH": 7,
    "MEDIUM": 4,
    "LOW": 1,
}


def severity_weight(severity: str | None) -> int:
    return SEVERITY_WEIGHT.get((severity or "").upper().strip(), 0)


def risk_level(score: int | float) -> str:
    """
    Map numeric score to a human-friendly level.

    Tuned for: severity_weight * affected_count (common ranges: 0..100+).
    """

    try:
        value = float(score)
    except (TypeError, ValueError):
        return "Low"

    if value >= 75:
        return "Critical"
    if value >= 40:
        return "High"
    if value >= 15:
        return "Moderate"
    return "Low"


def group_scan_results(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Group scan result rows by check_id (deduplication) and return a stable API shape.

    Expected input keys:
      - check_id, check_title, severity, service_name, region, resource_id, description, status
    """

    grouped: dict[str, dict[str, Any]] = {}
    status_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"PASS": 0, "FAIL": 0, "WARNING": 0})

    for row in rows:
        check_id = (row.get("check_id") or "").strip()
        if not check_id:
            # Keep unknowns separate but deterministic.
            check_id = "unknown-check"

        if check_id not in grouped:
            grouped[check_id] = {
                "check_id": check_id,
                "check_title": row.get("check_title"),
                "severity": row.get("severity"),
                "services": set(),
                "regions": set(),
                "affected_resources": set(),
                "description": row.get("description"),
            }

        entry = grouped[check_id]
        if row.get("service_name"):
            entry["services"].add(row["service_name"])
        if row.get("region"):
            entry["regions"].add(row["region"])
        if row.get("resource_id"):
            entry["affected_resources"].add(row["resource_id"])

        status = (row.get("status") or "").upper().strip()
        if status in status_counts[check_id]:
            status_counts[check_id][status] += 1

        # Prefer the highest severity observed within a group.
        current = severity_weight(entry.get("severity"))
        candidate = severity_weight(row.get("severity"))
        if candidate > current:
            entry["severity"] = row.get("severity")

        # Prefer a non-empty title/description.
        if not entry.get("check_title") and row.get("check_title"):
            entry["check_title"] = row.get("check_title")
        if not entry.get("description") and row.get("description"):
            entry["description"] = row.get("description")

    payload: list[dict[str, Any]] = []
    for check_id, entry in grouped.items():
        sev = entry.get("severity")
        weight = severity_weight(sev)
        affected_count = len(entry["affected_resources"])
        score = int(weight * max(affected_count, 1))

        remediation = build_remediation(
            check_id=check_id,
            check_title=entry.get("check_title"),
            service_name=(next(iter(entry["services"])) if entry["services"] else None),
        )

        # Structured fix object expected by frontend.
        fix = None
        risk_text = None
        if remediation:
            risk_text = remediation.get("risk")
            fix = {
                "steps": remediation.get("steps", []),
                "effort": remediation.get("difficulty"),
                # Default impact based on severity when not explicitly provided.
                "impact": "High" if weight >= 7 else ("Medium" if weight >= 4 else "Low"),
            }

        issue_type = entry.get("check_title") or check_id
        payload.append(
            {
                "issue_type": issue_type,
                "check_id": check_id,
                "severity": sev,
                "affected_count": affected_count,
                "services": sorted(entry["services"]),
                "regions": sorted(entry["regions"]) or ["GLOBAL"],
                "description": entry.get("description") or "",
                "risk": risk_text or "",
                "fix": fix
                or {
                    "steps": [
                        "Review the affected resource configuration",
                        "Apply least-privilege and restrict public access where possible",
                        "Re-run the scan to confirm remediation",
                    ],
                    "effort": "Medium",
                    "impact": "Medium",
                },
                "risk_score": score,
                "risk_level": risk_level(score),
                "severity_weight": weight,
                "status_breakdown": status_counts.get(check_id, {"PASS": 0, "FAIL": 0, "WARNING": 0}),
            }
        )

    # Sort by risk_score desc, then severity weight desc.
    payload.sort(key=lambda x: (x.get("risk_score", 0), x.get("severity_weight", 0)), reverse=True)
    return payload


def top_risks(grouped_payload: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 5
    limit = max(1, min(limit, 10))
    return grouped_payload[:limit]

