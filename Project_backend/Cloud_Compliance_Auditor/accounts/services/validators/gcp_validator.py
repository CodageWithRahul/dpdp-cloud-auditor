import json

from google.auth.transport.requests import Request
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


def _load_service_account_info(raw_value):
    if isinstance(raw_value, dict):
        return raw_value

    if isinstance(raw_value, str):
        return json.loads(raw_value)

    raise ValueError("service_account_json must be a JSON object or string.")


import json
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


import json
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


def validate_credentials(credentials):
    service_account_info = credentials.get("service_account_json")

    if not service_account_info:
        return False, "service_account_json is required."

    try:
        # ✅ Parse input safely
        info = _load_service_account_info(service_account_info)

        # ✅ Create credentials
        creds = service_account.Credentials.from_service_account_info(
            info,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )

        # ✅ Auth check
        creds.refresh(Request())

        # ✅ Project check (STRICT)
        project_id = info.get("project_id")
        if not project_id:
            return False, "Project ID missing in service account"

        crm = build("cloudresourcemanager", "v1", credentials=creds)
        project = crm.projects().get(projectId=project_id).execute()

        # ✅ Check if project is active
        state = project.get("lifecycleState")
        if state != "ACTIVE":
            return False, f"Project is not active (state: {state})"

        return True, None

    except (json.JSONDecodeError, ValueError) as exc:
        return False, f"Invalid JSON: {str(exc)}"

    except HttpError as e:

        if e.resp.status == 404:
            return False, "Project not found"
        if e.resp.status == 403:
            return (
                False,
                "Access denied to project: Make sure Cloud Resource Manager API is enabled and the service account has permissions. Or Refer to documentation for required permissions.",
            )
        return False, f"GCP API error ({e.resp.status})"

    except Exception as exc:
        return False, f"Validation failed: {str(exc)}"
