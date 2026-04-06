import logging

from botocore.exceptions import ClientError

from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


def check_open_security_groups(session):
    client = session.client("ec2")
    findings = []

    try:
        groups = client.describe_security_groups()["SecurityGroups"]
    except ClientError as exc:
        logger.warning("Unable to describe security groups: %s", exc)
        return [
            build_issue(
                "Security group enumeration failed",
                "The scanner could not list security groups.",
                "Grant ec2:DescribeSecurityGroups to the scanner role.",
            )
        ]

    for group in groups:
        group_id = group["GroupId"]
        for permission in group.get("IpPermissions", []):
            for ip_range in permission.get("IpRanges", []):
                cidr = ip_range.get("CidrIp")
                if cidr == "0.0.0.0/0":
                    issue = build_issue(
                        "Open security group",
                        "The security group allows ingress from the entire Internet.",
                        "Narrow the CIDR blocks to specific IPs or ranges.",
                        severity="HIGH",
                    )
                    issue.update({"resource_type": "Security Group", "resource_id": group_id})
                    findings.append(issue)
                    break

    return findings


def run(session):
    return check_open_security_groups(session)
