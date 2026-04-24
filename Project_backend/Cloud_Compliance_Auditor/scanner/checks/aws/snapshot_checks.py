import logging
from botocore.exceptions import ClientError
from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


# ---------------------------
# GET ALL SNAPSHOTS
# ---------------------------
def get_snapshots(client):
    snapshots = []

    try:
        paginator = client.get_paginator("describe_snapshots")

        for page in paginator.paginate(OwnerIds=["self"]):
            snapshots.extend(page["Snapshots"])

    except ClientError as error:
        logger.warning("Unable to describe snapshots: %s", error)
        return None

    return snapshots


# ---------------------------
# PUBLIC SNAPSHOT CHECK
# ---------------------------
def check_public_snapshots(client, snapshots):
    findings = []

    for snapshot in snapshots:
        snapshot_id = snapshot["SnapshotId"]

        try:
            attrs = client.describe_snapshot_attribute(
                SnapshotId=snapshot_id, Attribute="createVolumePermission"
            )

        except ClientError as error:
            logger.warning(
                "Unable to check snapshot permissions for %s: %s", snapshot_id, error
            )
            continue

        permissions = attrs.get("CreateVolumePermissions", [])

        for perm in permissions:
            if perm.get("Group") == "all":

                issue = build_issue(
                    "Public EBS snapshot detected",
                    "Snapshot is publicly accessible and can be copied by anyone.",
                    "Remove public permissions from the snapshot.",
                    severity="HIGH",
                )

                issue.update(
                    {"resource_type": "EBS Snapshot", "resource_id": snapshot_id}
                )

                findings.append(issue)
                break

    return findings


# ---------------------------
# SNAPSHOT ENCRYPTION CHECK
# ---------------------------
def check_snapshot_encryption(snapshots):
    findings = []

    for snapshot in snapshots:

        if not snapshot.get("Encrypted"):

            snapshot_id = snapshot["SnapshotId"]

            issue = build_issue(
                "Unencrypted EBS snapshot",
                "Snapshot data is not encrypted.",
                "Create encrypted snapshots using KMS.",
                severity="MEDIUM",
            )

            issue.update({"resource_type": "EBS Snapshot", "resource_id": snapshot_id})

            findings.append(issue)

    return findings


# ---------------------------
# UNUSED SNAPSHOT CHECK
# ---------------------------
def check_unused_snapshots(snapshots):
    findings = []

    for snapshot in snapshots:

        if not snapshot.get("VolumeId"):

            snapshot_id = snapshot["SnapshotId"]

            issue = build_issue(
                "Potential unused snapshot",
                "Snapshot is not associated with an active volume.",
                "Review and delete unused snapshots.",
                severity="LOW",
            )

            issue.update({"resource_type": "EBS Snapshot", "resource_id": snapshot_id})

            findings.append(issue)

    return findings


# ---------------------------
# MAIN RUNNER
# ---------------------------
def run(session):

    client = session.client("ec2")
    findings = []

    snapshots = get_snapshots(client)

    if snapshots is None:
        return [
            build_issue(
                "Snapshot enumeration failed",
                "The scanner could not list EBS snapshots.",
                "Ensure the scanner role has ec2:DescribeSnapshots permission.",
                severity="HIGH",
            )
        ]

    findings.extend(check_public_snapshots(client, snapshots))
    findings.extend(check_snapshot_encryption(snapshots))
    findings.extend(check_unused_snapshots(snapshots))

    return findings
