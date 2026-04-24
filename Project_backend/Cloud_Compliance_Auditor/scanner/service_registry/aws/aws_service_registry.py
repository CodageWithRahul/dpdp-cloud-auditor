SERVICE_SCOPE = {
    "S3": "global",
    "IAM": "global",
    "CloudFront": "global",
    "Route53": "global",
    "EC2": "regional",
    "RDS": "regional",
    "Lambda": "regional",
    "EKS": "regional",
    "ECS": "regional",
    "DynamoDB": "regional",
}


def get_global_services():
    return {name for name, scope in SERVICE_SCOPE.items() if scope == "global"}


def get_regional_services():
    return {name for name, scope in SERVICE_SCOPE.items() if scope == "regional"}

