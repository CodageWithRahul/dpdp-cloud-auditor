import boto3
from botocore.exceptions import ClientError


def validate_credentials(credentials):
    access_key = credentials.get("access_key")
    secret_key = credentials.get("secret_key")
    region = credentials.get("region") or "us-east-1"

    if not access_key or not secret_key:
        return False, "access_key and secret_key are required."

    try:
        client = boto3.client(
            "sts",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )
        client.get_caller_identity()
        return True, None

    except ClientError as e:
        return False, str(e)
