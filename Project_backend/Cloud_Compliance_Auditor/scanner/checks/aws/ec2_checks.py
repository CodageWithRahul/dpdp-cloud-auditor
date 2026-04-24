import logging
from botocore.exceptions import ClientError
from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


def get_all_instances(client):

    instances = []

    try:
        paginator = client.get_paginator("describe_instances")

        for page in paginator.paginate():

            for reservation in page["Reservations"]:
                for instance in reservation["Instances"]:
                    instances.append(instance)

    except ClientError as exc:
        logger.warning("Unable to describe instances: %s", exc)

    return instances


# ---------------------------
# Unencrypted EBS Volumes
# ---------------------------


def check_unencrypted_volumes(client):
    findings = []

    try:
        volumes = client.describe_volumes()["Volumes"]
    except ClientError as exc:
        logger.warning("Unable to describe volumes: %s", exc)
        return []

    for volume in volumes:
        if volume.get("Encrypted"):
            continue

        volume_id = volume["VolumeId"]

        issue = build_issue(
            "Unencrypted EBS volume",
            "The EBS volume is not encrypted at rest.",
            "Enable encryption on the volume.",
            severity="MEDIUM",
        )

        issue.update({"resource_type": "EBS Volume", "resource_id": volume_id})

        findings.append(issue)

    return findings


# ---------------------------
# Instances With Public IP
# ---------------------------


def check_public_ip(instances):
    findings = []

    for instance in instances:

        public_ip = instance.get("PublicIpAddress")

        if not public_ip:
            continue

        instance_id = instance["InstanceId"]

        issue = build_issue(
            "EC2 instance has public IP",
            "Instance is reachable from the internet.",
            "Use private subnets or remove public IP.",
            severity="MEDIUM",
        )

        issue.update({"resource_type": "EC2 Instance", "resource_id": instance_id})

        findings.append(issue)

    return findings


# ---------------------------
# Instances Without IAM Role
# ---------------------------


def check_no_iam_role(instances):
    findings = []

    for instance in instances:

        if instance.get("IamInstanceProfile"):
            continue

        instance_id = instance["InstanceId"]

        issue = build_issue(
            "EC2 instance without IAM role",
            "Instance does not have an IAM role attached.",
            "Attach an IAM role instead of using static credentials.",
            severity="MEDIUM",
        )

        issue.update({"resource_type": "EC2 Instance", "resource_id": instance_id})

        findings.append(issue)

    return findings


# ---------------------------
# IMDSv1 Enabled
# ---------------------------


def check_imdsv1(instances):
    findings = []

    for instance in instances:

        metadata = instance.get("MetadataOptions", {})

        if metadata.get("HttpTokens") == "required":
            continue

        instance_id = instance["InstanceId"]

        issue = build_issue(
            "IMDSv1 enabled",
            "Instance metadata service v1 is enabled.",
            "Require IMDSv2 by setting HttpTokens to 'required'.",
            severity="HIGH",
        )

        issue.update({"resource_type": "EC2 Instance", "resource_id": instance_id})

        findings.append(issue)

    return findings


# ---------------------------
# Detailed Monitoring Disabled
# ---------------------------


def check_monitoring(instances):
    findings = []

    for instance in instances:

        monitoring = instance.get("Monitoring", {}).get("State")

        if monitoring == "enabled":
            continue

        instance_id = instance["InstanceId"]

        issue = build_issue(
            "Detailed monitoring disabled",
            "CloudWatch detailed monitoring is not enabled.",
            "Enable detailed monitoring.",
            severity="LOW",
        )

        issue.update({"resource_type": "EC2 Instance", "resource_id": instance_id})

        findings.append(issue)

    return findings


# ---------------------------
# Stopped Instances
# ---------------------------


def check_stopped_instances(instances):
    findings = []

    for instance in instances:

        state = instance["State"]["Name"]

        if state != "stopped":
            continue

        instance_id = instance["InstanceId"]

        issue = build_issue(
            "Stopped EC2 instance",
            "Instance is stopped and may be unused.",
            "Review and remove unused instances.",
            severity="LOW",
        )

        issue.update({"resource_type": "EC2 Instance", "resource_id": instance_id})

        findings.append(issue)

    return findings


# checking SG exposure inside EC2.


def check_security_groups(instances):
    findings = []

    for instance in instances:

        instance_id = instance["InstanceId"]

        for sg in instance.get("SecurityGroups", []):

            sg_id = sg["GroupId"]

            # You should ideally check SG rules separately,
            # but at least flag attachment presence
            if not sg_id:
                continue

    return findings


# UNUSED ATTACHED RESOURCES


def check_unattached_volumes(client):
    findings = []

    volumes = client.describe_volumes()["Volumes"]

    for v in volumes:
        if v["State"] == "available":  # not attached
            findings.append(
                build_issue(
                    "Unattached EBS volume",
                    "Volume is not attached to any instance.",
                    "Delete or attach to reduce cost and risk.",
                    severity="LOW",
                )
            )

    return findings


# INSTANCE WITHOUT TAGS


def check_missing_tags(instances):
    findings = []

    for i in instances:
        if not i.get("Tags"):
            findings.append(
                build_issue(
                    "EC2 instance missing tags",
                    "Instance has no metadata tags.",
                    "Add tags for ownership and classification.",
                    severity="LOW",
                )
            )

    return findings


# ---------------------------
# Main Runner
# ---------------------------


def run(session):

    findings = []

    client = session.client("ec2")

    instances = get_all_instances(client)

    findings.extend(check_unencrypted_volumes(client))
    findings.extend(check_public_ip(instances))
    findings.extend(check_no_iam_role(instances))
    findings.extend(check_imdsv1(instances))
    findings.extend(check_monitoring(instances))
    findings.extend(check_stopped_instances(instances))

    return findings
