import logging

from botocore.exceptions import ClientError

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


def check_unencrypted_volumes(session):
    client = session.client("ec2")
    findings = []

    try:
        volumes = client.describe_volumes()["Volumes"]
    except ClientError as exc:
        logger.warning("Unable to describe EC2 volumes: %s", exc)
        return [
            build_issue(
                "Volume enumeration failed",
                "The scanner could not describe EBS volumes.",
                "Grant ec2:DescribeVolumes to the scanner role.",
            )
        ]

    for volume in volumes:
        if volume.get("Encrypted"):
            continue
        volume_id = volume["VolumeId"]
        issue = build_issue(
            "Unencrypted EBS volume",
            "The EBS volume is not encrypted at rest.",
            "Enable encryption on the volume or create a new encrypted volume.",
            severity="MEDIUM",
        )
        issue.update({"resource_type": "EBS Volume", "resource_id": volume_id})
        findings.append(issue)

    return findings


def run(session):
    return check_unencrypted_volumes(session)
