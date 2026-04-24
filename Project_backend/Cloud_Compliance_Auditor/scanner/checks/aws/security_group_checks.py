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

            from_port = permission.get("FromPort", -1)
            to_port = permission.get("ToPort", -1)
            protocol = permission.get("IpProtocol")

            for ip_range in permission.get("IpRanges", []):
                cidr = ip_range.get("CidrIp")

                # 1. FULL INTERNET ACCESS
                if cidr in ["0.0.0.0/0", "::/0"]:

                    severity = "HIGH"

                    # 2. CRITICAL PORTS
                    if from_port in [22, 3389]:
                        severity = "CRITICAL"

                    # 3. ALL PORTS OPEN
                    if from_port == 0 and to_port == 65535:
                        severity = "CRITICAL"

                    # 4. ALL PROTOCOLS
                    if protocol == "-1":
                        severity = "CRITICAL"

                    issue = build_issue(
                        "Overly permissive security group",
                        f"Security group allows open access from {cidr}.",
                        "Restrict inbound rules to specific IP ranges and required ports only.",
                        severity=severity,
                    )

                    issue.update(
                        {"resource_type": "Security Group", "resource_id": group_id}
                    )

                    findings.append(issue)
                    break

    return findings


def run(session):
    return check_open_security_groups(session)
