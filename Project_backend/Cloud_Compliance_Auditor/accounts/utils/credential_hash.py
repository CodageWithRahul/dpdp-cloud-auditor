import hashlib
import json


def make_credentials_hash(provider, credentials):
    data = {"provider": provider.strip().lower(), "credentials": credentials}

    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
