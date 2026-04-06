from google.oauth2 import service_account
from google.cloud import compute_v1


def get_regions(credentials):

    try:
        service_account_json = credentials.get("service_account_json")

        creds = service_account.Credentials.from_service_account_info(
            service_account_json
        )

        project_id = service_account_json.get("project_id")

        client = compute_v1.RegionsClient(credentials=creds)

        regions = client.list(project=project_id)

        return [region.name for region in regions], None

    except Exception as e:
        return None, str(e)
