"""
Utility functions for building standardized compliance findings.
"""


def build_issue(issue_type, description, recommendation, severity="MEDIUM"):
    return {
        "issue_type": issue_type,
        "severity": severity,
        "compliance_type": "MISCONFIGURATION",
        "description": description,
        "recommendation": recommendation,
    }
