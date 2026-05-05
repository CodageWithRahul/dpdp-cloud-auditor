import logging

from googleapiclient.discovery import build

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)

# 🔥 Logging is GLOBAL
SCOPE = "GLOBAL"


# -------------------------------
# 1. Audit Logging Check
# -------------------------------
def check_audit_logging(context):
    findings = []

    try:
        crm = build("cloudresourcemanager", "v1", credentials=context.credentials)

        policy = (
            crm.projects().getIamPolicy(resource=context.project_id, body={}).execute()
        )
    except Exception as exc:
        logger.warning("Failed to fetch IAM policy for logging check: %s", exc)
        return []

    audit_configs = policy.get("auditConfigs", [])

    if not audit_configs:
        findings.append(
            {
                **build_issue(
                    "Audit logging not configured",
                    "No audit logging configuration found.",
                    "Enable Admin Activity, Data Access, and System Event logs.",
                    severity="HIGH",
                ),
                "resource_type": "Logging",
                "resource_id": context.project_id,
            }
        )

    return findings


# -------------------------------
# 2. Log Sink Check
# -------------------------------
def check_log_sinks(context):
    findings = []

    try:
        logging_service = build("logging", "v2", credentials=context.credentials)

        sinks = (
            logging_service.projects()
            .sinks()
            .list(parent=f"projects/{context.project_id}")
            .execute()
        )
    except Exception as exc:
        logger.warning("Unable to list log sinks: %s", exc)
        return []

    sink_list = sinks.get("sinks", [])

    if not sink_list:
        findings.append(
            {
                **build_issue(
                    "No log sinks configured",
                    "Logs are not being exported to any external destination.",
                    "Configure log sinks (e.g., BigQuery, Storage, SIEM).",
                    severity="MEDIUM",
                ),
                "resource_type": "Logging",
                "resource_id": context.project_id,
            }
        )

    return findings


# -------------------------------
# 3. Basic Logging Coverage Check
# -------------------------------
def check_basic_logging_coverage(context):
    findings = []

    try:
        logging_service = build("logging", "v2", credentials=context.credentials)

        metrics = (
            logging_service.projects()
            .metrics()
            .list(parent=f"projects/{context.project_id}")
            .execute()
        )
    except Exception:
        return []

    metric_list = metrics.get("metrics", [])

    if not metric_list:
        findings.append(
            {
                **build_issue(
                    "No logging metrics configured",
                    "No log-based metrics found for monitoring.",
                    "Create log-based metrics for alerting and monitoring.",
                    severity="LOW",
                ),
                "resource_type": "Logging",
                "resource_id": context.project_id,
            }
        )

    return findings


# -------------------------------
# Main Runner
# -------------------------------
def run(context):
    findings = []

    findings.extend(check_audit_logging(context))
    findings.extend(check_log_sinks(context))
    findings.extend(check_basic_logging_coverage(context))

    return findings
