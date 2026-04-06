from azure.identity import ClientSecretCredential
from azure.mgmt.resource import SubscriptionClient


def get_regions(credentials):

    try:
        tenant_id = credentials.get("tenant_id")
        client_id = credentials.get("client_id")
        client_secret = credentials.get("client_secret")
        subscription_id = credentials.get("subscription_id")

        credential = ClientSecretCredential(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret,
        )

        client = SubscriptionClient(credential)

        locations = client.subscriptions.list_locations(subscription_id)

        return [loc.name for loc in locations], None

    except Exception as e:
        return None, str(e)
