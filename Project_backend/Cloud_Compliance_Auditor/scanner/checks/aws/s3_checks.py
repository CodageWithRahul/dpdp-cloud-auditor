import json
import logging

from botocore.exceptions import ClientError
from scanner.utils.issue_builder import build_issue

logger = logging.getLogger(__name__)


INDIA_REGIONS = ["ap-south-1", "ap-south-2"]

PERSONAL_DATA_TAGS = ["personal", "pii", "sensitive", "confidential", "customer-data"]


def check_public_s3_buckets(session):
    client = session.client("s3")
    findings = []

    try:
        buckets = client.list_buckets().get("Buckets", [])
    except ClientError as exc:
        logger.warning("Unable to list S3 buckets: %s", exc)
        return [
            build_issue(
                "S3 enumeration failed",
                "The scanner could not list S3 buckets using the provided credentials.",
                "Ensure the IAM principal can call s3:ListAllMyBuckets.",
            )
        ]

    for bucket in buckets:
        bucket_name = bucket["Name"]
        resource_info = {"resource_type": "S3 Bucket", "resource_id": bucket_name}
        # -------------------------------------------------
        # GET BUCKET REGION
        # -------------------------------------------------
        try:
            response = client.head_bucket(Bucket=bucket_name)
            bucket_region = response["ResponseMetadata"]["HTTPHeaders"].get(
                "x-amz-bucket-region", "unknown"
            )
        except ClientError:
            bucket_region = "unknown"

        # -------------------------------------------------
        # GET BUCKET TAGS (DATA CLASSIFICATION)
        # -------------------------------------------------
        data_class = None

        try:
            tagset = client.get_bucket_tagging(Bucket=bucket_name)["TagSet"]

            for tag in tagset:
                if tag["Key"].lower() in ["dataclass", "data_class", "classification"]:
                    data_class = tag["Value"].lower()

        except ClientError:
            pass

        # -------------------------------------------------
        # DPDP PERSONAL DATA LOCATION CHECK
        # -------------------------------------------------
        if (
            data_class
            and data_class in PERSONAL_DATA_TAGS
            and bucket_region not in INDIA_REGIONS
        ):

            issue = build_issue(
                "Personal data stored outside India",
                f"S3 bucket contains sensitive data but is hosted in region {bucket_region}.",
                "Move sensitive data to Indian regions such as ap-south-1 (Mumbai) or ap-south-2 (Hyderabad).",
                severity="HIGH",
            )

            issue.update(resource_info)
            findings.append(issue)
        # -------------------------------------------------
        # PUBLIC ACCESS BLOCK CHECK
        # -------------------------------------------------
        try:
            block = client.get_public_access_block(Bucket=bucket_name)[
                "PublicAccessBlockConfiguration"
            ]

            required = [
                "BlockPublicAcls",
                "IgnorePublicAcls",
                "BlockPublicPolicy",
                "RestrictPublicBuckets",
            ]

            if not all(block.get(x) for x in required):
                issue = build_issue(
                    "Public access block incomplete",
                    "Not all S3 public access block flags are enabled.",
                    "Enable all public access block flags to prevent accidental exposure.",
                )
                issue.update(resource_info)
                findings.append(issue)

        except ClientError:
            issue = build_issue(
                "Public access block missing",
                "Bucket has no PublicAccessBlock configuration.",
                "Enable S3 public access block.",
                severity="MEDIUM",
            )
            issue.update(resource_info)
            findings.append(issue)

        # -------------------------------------------------
        # PUBLIC ACL CHECK
        # -------------------------------------------------
        try:
            acl = client.get_bucket_acl(Bucket=bucket_name)

            for grant in acl.get("Grants", []):
                uri = grant.get("Grantee", {}).get("URI", "")
                if "AllUsers" in uri or "AuthenticatedUsers" in uri:
                    issue = build_issue(
                        "Public ACL detected",
                        "Bucket ACL grants public access.",
                        "Remove public ACL permissions.",
                        severity="HIGH",
                    )
                    issue.update(resource_info)
                    findings.append(issue)
                    break
        except ClientError:
            pass

        # -------------------------------------------------
        # BUCKET POLICY CHECK
        # -------------------------------------------------
        try:
            policy_text = client.get_bucket_policy(Bucket=bucket_name)["Policy"]
            policy = json.loads(policy_text)

            for stmt in policy.get("Statement", []):
                principal = stmt.get("Principal")
                action = stmt.get("Action")

                if principal in ("*", {"AWS": "*"}):

                    issue = build_issue(
                        "Public bucket policy",
                        "Bucket policy allows access to '*'.",
                        "Restrict policy to specific IAM principals.",
                        severity="HIGH",
                    )
                    issue.update(resource_info)
                    findings.append(issue)

                if action == "*" or action == ["*"]:
                    issue = build_issue(
                        "Wildcard action in bucket policy",
                        "Bucket policy allows '*' actions.",
                        "Restrict allowed S3 actions.",
                        severity="MEDIUM",
                    )
                    issue.update(resource_info)
                    findings.append(issue)

        except ClientError:
            pass

        # -------------------------------------------------
        # HTTPS ENFORCEMENT CHECK
        # -------------------------------------------------
        try:
            policy_text = client.get_bucket_policy(Bucket=bucket_name)["Policy"]
            policy = json.loads(policy_text)

            enforce_https = False

            for stmt in policy.get("Statement", []):
                condition = stmt.get("Condition", {})
                bool_cond = condition.get("Bool", {})

                if bool_cond.get("aws:SecureTransport") == "false":
                    enforce_https = True

            if not enforce_https:
                issue = build_issue(
                    "HTTPS not enforced",
                    "Bucket does not enforce HTTPS-only access.",
                    "Add bucket policy denying aws:SecureTransport=false.",
                    severity="HIGH",
                )
                issue.update(resource_info)
                findings.append(issue)

        except ClientError:
            pass

        # -------------------------------------------------
        # ENCRYPTION CHECK
        # -------------------------------------------------
        try:
            enc = client.get_bucket_encryption(Bucket=bucket_name)
            rules = enc["ServerSideEncryptionConfiguration"]["Rules"]

            algo = rules[0]["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"]

            if algo == "AES256":
                issue = build_issue(
                    "Weak encryption type",
                    "Bucket uses AES256 instead of KMS.",
                    "Use SSE-KMS for stronger encryption and key management.",
                    severity="LOW",
                )
                issue.update(resource_info)
                findings.append(issue)

        except ClientError:
            issue = build_issue(
                "Bucket encryption disabled",
                "Bucket does not have server-side encryption enabled.",
                "Enable SSE-S3 or SSE-KMS encryption.",
                severity="HIGH",
            )
            issue.update(resource_info)
            findings.append(issue)

        # -------------------------------------------------
        # VERSIONING CHECK
        # -------------------------------------------------
        try:
            versioning = client.get_bucket_versioning(Bucket=bucket_name)

            if versioning.get("Status") != "Enabled":
                issue = build_issue(
                    "Bucket versioning disabled",
                    "S3 versioning is not enabled.",
                    "Enable versioning for data protection.",
                    severity="MEDIUM",
                )
                issue.update(resource_info)
                findings.append(issue)

            if versioning.get("MFADelete") != "Enabled":
                issue = build_issue(
                    "MFA delete not enabled",
                    "Bucket versioning is enabled but MFA delete is disabled.",
                    "Enable MFA delete for critical buckets.",
                    severity="LOW",
                )
                issue.update(resource_info)
                findings.append(issue)

        except ClientError:
            pass

        # -------------------------------------------------
        # ACCESS LOGGING CHECK
        # -------------------------------------------------
        try:
            log = client.get_bucket_logging(Bucket=bucket_name)

            if "LoggingEnabled" not in log:
                issue = build_issue(
                    "Access logging disabled",
                    "Bucket access logging is not enabled.",
                    "Enable S3 access logs for audit trails.",
                    severity="MEDIUM",
                )
                issue.update(resource_info)
                findings.append(issue)

        except ClientError:
            pass

        # -------------------------------------------------
        # LIFECYCLE POLICY CHECK
        # -------------------------------------------------
        try:
            lifecycle = client.get_bucket_lifecycle_configuration(Bucket=bucket_name)

            rules = lifecycle.get("Rules", [])

            if not rules:
                raise ClientError({}, "NoLifecycleRules")

        except ClientError:
            issue = build_issue(
                "Lifecycle policy missing",
                "Bucket does not define lifecycle rules.",
                "Add lifecycle rules to delete or archive old data.",
                severity="MEDIUM",
            )
            issue.update(resource_info)
            findings.append(issue)

        # -------------------------------------------------
        # OWNERSHIP CONTROL CHECK
        # -------------------------------------------------
        try:
            ownership = client.get_bucket_ownership_controls(Bucket=bucket_name)

            rule = ownership["OwnershipControls"]["Rules"][0]

            if rule["ObjectOwnership"] != "BucketOwnerEnforced":
                issue = build_issue(
                    "Bucket ownership not enforced",
                    "Bucket does not enforce BucketOwnerEnforced ownership.",
                    "Enable BucketOwnerEnforced to disable ACL-based ownership.",
                    severity="MEDIUM",
                )
                issue.update(resource_info)
                findings.append(issue)

        except ClientError:
            pass

        # -------------------------------------------------
        # OBJECT LOCK CHECK
        # -------------------------------------------------
        try:
            lock = client.get_object_lock_configuration(Bucket=bucket_name)

            if lock["ObjectLockConfiguration"]["ObjectLockEnabled"] != "Enabled":
                issue = build_issue(
                    "Object lock not enabled",
                    "Bucket does not have object lock enabled.",
                    "Enable object lock for ransomware protection.",
                    severity="LOW",
                )
                issue.update(resource_info)
                findings.append(issue)

        except ClientError:
            pass

        # -------------------------------------------------
        # REPLICATION CHECK
        # -------------------------------------------------
        try:
            client.get_bucket_replication(Bucket=bucket_name)
        except ClientError:
            issue = build_issue(
                "Replication not configured",
                "Bucket replication is not configured.",
                "Consider enabling cross-region replication for disaster recovery.",
                severity="LOW",
            )
            issue.update(resource_info)
            findings.append(issue)

    return findings


def run(session):
    return check_public_s3_buckets(session)
