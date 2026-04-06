import boto3
from botocore.exceptions import ClientError


def get_regions(credentials):
    access_key = credentials.get("access_key")
    secret_key = credentials.get("secret_key")
    region = credentials.get("region") or "us-east-1"

    if not access_key or not secret_key:
        return None, "access_key and secret_key are required."

    try:
        ec2 = boto3.client(
            "ec2",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

        response = ec2.describe_regions()
        return [r["RegionName"] for r in response["Regions"]], None

    except ClientError as e:
        return None, str(e)
