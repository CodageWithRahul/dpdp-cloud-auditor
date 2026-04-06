from azure.identity import ClientSecretCredential
from azure.mgmt.resource import SubscriptionClient
from azure.core.exceptions import AzureError


def validate_credentials(credentials):
    tenant_id = credentials.get("tenant_id")
    client_id = credentials.get("client_id")
    client_secret = credentials.get("client_secret")
    subscription_id = credentials.get("subscription_id")

    missing = [
        field
        for field, value in [
            ("tenant_id", tenant_id),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("subscription_id", subscription_id),
        ]
        if not value
    ]

    if missing:
        joined = ", ".join(missing)
        return False, f"Missing required Azure credential fields: {joined}."

    try:
        credential = ClientSecretCredential(
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret,
        )

        subscription_client = SubscriptionClient(credential)
        subscription_client.subscriptions.get(subscription_id)

        return True, None

    except AzureError as exc:
        return False, str(exc)
