import logging
from botocore.exceptions import ClientError
from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


# ---------------------------
# GET ALL VPCS
# ---------------------------
def get_vpcs(client):
    vpcs = []

    try:
        paginator = client.get_paginator("describe_vpcs")

        for page in paginator.paginate():
            vpcs.extend(page["Vpcs"])

    except ClientError as error:
        logger.warning("Unable to describe VPCs: %s", error)
        return None

    return vpcs


# ---------------------------
# DEFAULT VPC CHECK
# ---------------------------
def check_default_vpc(vpcs):
    findings = []

    for vpc in vpcs:
        if vpc.get("IsDefault"):

            vpc_id = vpc["VpcId"]

            issue = build_issue(
                "Default VPC detected",
                "The account contains a default VPC.",
                "Consider removing unused default VPCs.",
                severity="LOW",
            )

            issue.update({"resource_type": "VPC", "resource_id": vpc_id})

            findings.append(issue)

    return findings


# ---------------------------
# VPC FLOW LOG CHECK
# ---------------------------
def check_vpc_flow_logs(ec2_client, vpcs):
    findings = []

    try:
        flow_logs = ec2_client.describe_flow_logs()["FlowLogs"]
    except ClientError as error:
        logger.warning("Unable to describe flow logs: %s", error)
        return findings

    flow_log_vpcs = {log["ResourceId"] for log in flow_logs}

    for vpc in vpcs:
        vpc_id = vpc["VpcId"]

        if vpc_id not in flow_log_vpcs:

            issue = build_issue(
                "VPC flow logs disabled",
                "VPC does not have flow logs enabled.",
                "Enable flow logs for network visibility and auditing.",
                severity="MEDIUM",
            )

            issue.update({"resource_type": "VPC", "resource_id": vpc_id})

            findings.append(issue)

    return findings


# ---------------------------
# INTERNET GATEWAY CHECK
# ---------------------------
def check_internet_gateways(client):
    findings = []

    try:
        igws = client.describe_internet_gateways()["InternetGateways"]
    except ClientError as error:
        logger.warning("Unable to describe internet gateways: %s", error)
        return findings

    for igw in igws:

        igw_id = igw["InternetGatewayId"]

        for attachment in igw.get("Attachments", []):

            vpc_id = attachment["VpcId"]

            issue = build_issue(
                "Internet gateway attached",
                "VPC has an internet gateway which may expose resources.",
                "Ensure only required subnets have internet access.",
                severity="LOW",
            )

            issue.update({"resource_type": "Internet Gateway", "resource_id": igw_id})

            findings.append(issue)

    return findings


# ---------------------------
# DEFAULT SECURITY GROUP CHECK
# ---------------------------
def check_default_security_group(client):
    findings = []

    try:
        groups = client.describe_security_groups(
            Filters=[{"Name": "group-name", "Values": ["default"]}]
        )["SecurityGroups"]

    except ClientError as error:
        logger.warning("Unable to describe default security groups: %s", error)
        return findings

    for group in groups:

        group_id = group["GroupId"]

        if group.get("IpPermissions"):

            issue = build_issue(
                "Default security group allows traffic",
                "Default security group has inbound rules configured.",
                "Restrict or remove rules from the default security group.",
                severity="MEDIUM",
            )

            issue.update({"resource_type": "Security Group", "resource_id": group_id})

            findings.append(issue)

    return findings


# ---------------------------
# MAIN RUNNER
# ---------------------------
def run(session):

    client = session.client("ec2")
    findings = []

    vpcs = get_vpcs(client)

    if vpcs is None:
        return [
            build_issue(
                "VPC enumeration failed",
                "The scanner could not list VPCs.",
                "Ensure the scanner role has ec2:DescribeVpcs permission.",
                severity="HIGH",
            )
        ]

    findings.extend(check_default_vpc(vpcs))
    findings.extend(check_vpc_flow_logs(client, vpcs))
    findings.extend(check_internet_gateways(client))
    findings.extend(check_default_security_group(client))

    return findings
