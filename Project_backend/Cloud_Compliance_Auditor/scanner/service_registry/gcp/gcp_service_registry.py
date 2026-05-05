# scanner/service_registry/gcp/gcp_service_registry.py

SERVICE_REGISTRY = {
    "compute_checks": {
        "name": "Compute",
        "scope": "REGIONAL",
        "apis": ["compute.googleapis.com"],
    },
    "storage_checks": {
        "name": "Storage",
        "scope": "GLOBAL",
        "apis": ["storage.googleapis.com"],
    },
    "iam_checks": {
        "name": "IAM",
        "scope": "GLOBAL",
        "apis": [
            "iam.googleapis.com",
            "cloudresourcemanager.googleapis.com",
        ],
    },
    "vpc_checks": {
        "name": "VPC",
        "scope": "GLOBAL",
        "apis": ["compute.googleapis.com"],
    },
    "sql_checks": {
        "name": "Cloud SQL",
        "scope": "REGIONAL",
        "apis": ["sqladmin.googleapis.com"],
    },
    "logging_checks": {
        "name": "Logging",
        "scope": "GLOBAL",
        "apis": ["logging.googleapis.com"],
    },
    "secrets_checks": {
        "name": "Secrets",
        "scope": "GLOBAL",
        "apis": ["secretmanager.googleapis.com"],
    },
    "functions_checks": {
        "name": "Cloud Functions",
        "scope": "REGIONAL",
        "apis": ["cloudfunctions.googleapis.com"],
    },
    "bigquery_checks": {
        "name": "BigQuery",
        "scope": "GLOBAL",
        "apis": ["bigquery.googleapis.com"],
    },
    "kms_checks": {
        "name": "KMS",
        "scope": "REGIONAL",
        "apis": ["cloudkms.googleapis.com"],
    },
}


def normalize_module_label(module_label: str):
    return module_label.split(".")[-1]


def get_service_config(module_label):
    module_label = normalize_module_label(module_label)

    if module_label in SERVICE_REGISTRY:
        return SERVICE_REGISTRY[module_label]

    raise ValueError(f"Unknown service module: {module_label}")


def get_service_name(module_label):
    return get_service_config(module_label)["name"]


def get_service_scope(module_label):
    return get_service_config(module_label)["scope"]


def get_required_apis(module_label):
    return get_service_config(module_label)["apis"]
