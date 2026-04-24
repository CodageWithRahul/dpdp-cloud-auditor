import logging
from botocore.exceptions import ClientError
from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


# ---------------------------
# GET ALL DB INSTANCES
# ---------------------------
def get_db_instances(client):
    instances = []

    try:
        paginator = client.get_paginator("describe_db_instances")

        for page in paginator.paginate():
            instances.extend(page["DBInstances"])

    except ClientError as error:
        logger.warning("Unable to describe RDS instances: %s", error)

        return None

    return instances


# ---------------------------
# PUBLICLY ACCESSIBLE CHECK
# ---------------------------
def check_public_access(instances):
    findings = []

    for db in instances:
        if db.get("PubliclyAccessible"):

            db_id = db["DBInstanceIdentifier"]

            issue = build_issue(
                "RDS instance publicly accessible",
                "The database instance is accessible from the internet.",
                "Disable public accessibility and use private subnets.",
                severity="HIGH",
            )

            issue.update({"resource_type": "RDS Instance", "resource_id": db_id})

            findings.append(issue)

    return findings


# ---------------------------
# STORAGE ENCRYPTION CHECK
# ---------------------------
def check_storage_encryption(instances):
    findings = []

    for db in instances:
        if not db.get("StorageEncrypted"):

            db_id = db["DBInstanceIdentifier"]

            issue = build_issue(
                "RDS storage not encrypted",
                "Database storage encryption is not enabled.",
                "Enable encryption using AWS KMS.",
                severity="HIGH",
            )

            issue.update({"resource_type": "RDS Instance", "resource_id": db_id})

            findings.append(issue)

    return findings


# ---------------------------
# BACKUP CHECK
# ---------------------------
def check_backups(instances):
    findings = []

    for db in instances:
        if db.get("BackupRetentionPeriod", 0) == 0:

            db_id = db["DBInstanceIdentifier"]

            issue = build_issue(
                "RDS automated backups disabled",
                "Automated backups are not enabled.",
                "Enable automated backups to protect against data loss.",
                severity="MEDIUM",
            )

            issue.update({"resource_type": "RDS Instance", "resource_id": db_id})

            findings.append(issue)

    return findings


# ---------------------------
# MULTI-AZ CHECK
# ---------------------------
def check_multi_az(instances):
    findings = []

    for db in instances:
        if not db.get("MultiAZ"):

            db_id = db["DBInstanceIdentifier"]

            issue = build_issue(
                "RDS Multi-AZ disabled",
                "The database instance is not configured for Multi-AZ high availability.",
                "Enable Multi-AZ for production workloads.",
                severity="LOW",
            )

            issue.update({"resource_type": "RDS Instance", "resource_id": db_id})

            findings.append(issue)

    return findings


# ---------------------------
# DELETION PROTECTION CHECK
# ---------------------------
def check_deletion_protection(instances):
    findings = []

    for db in instances:
        if not db.get("DeletionProtection"):

            db_id = db["DBInstanceIdentifier"]

            issue = build_issue(
                "RDS deletion protection disabled",
                "Deletion protection is not enabled for the database.",
                "Enable deletion protection to prevent accidental deletion.",
                severity="LOW",
            )

            issue.update({"resource_type": "RDS Instance", "resource_id": db_id})

            findings.append(issue)

    return findings


# ---------------------------
# MAIN RUNNER
# ---------------------------
def run(session):

    client = session.client("rds")
    findings = []

    instances = get_db_instances(client)

    if instances is None:
        return [
            build_issue(
                "RDS enumeration failed",
                "The scanner could not list RDS instances.",
                "Ensure the scanner role has rds:DescribeDBInstances permission.",
                severity="HIGH",
            )
        ]

    findings.extend(check_public_access(instances))
    findings.extend(check_storage_encryption(instances))
    findings.extend(check_backups(instances))
    findings.extend(check_multi_az(instances))
    findings.extend(check_deletion_protection(instances))

    return findings
