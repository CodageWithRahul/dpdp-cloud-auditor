import json

from google.auth.transport.requests import Request
from google.oauth2 import service_account


def _load_service_account_info(raw_value):
    if isinstance(raw_value, dict):
        return raw_value

    if isinstance(raw_value, str):
        return json.loads(raw_value)

    raise ValueError("service_account_json must be a JSON object or string.")


def validate_credentials(credentials):
    service_account_info = credentials.get("service_account_json")
    if service_account_info is None:
        return False, "service_account_json is required."

    try:
        info = _load_service_account_info(service_account_info)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )

        creds.refresh(Request())
        return True, None

    except (json.JSONDecodeError, ValueError) as exc:
        return False, str(exc)

    except Exception as exc:
        return False, str("Check Credentials")
