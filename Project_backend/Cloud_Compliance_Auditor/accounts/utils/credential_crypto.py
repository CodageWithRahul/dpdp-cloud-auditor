import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

_KEY_INFO = "cloud-credentials-v1"


def _get_fernet() -> Fernet:
    """
    Returns Fernet instance using ONLY environment-based key.

    Works in:
    - Local (.env via os.getenv)
    - Production (Render env vars)

    Fallback removed to avoid encryption mismatch issues.
    """

    key = getattr(settings, "CLOUD_CREDENTIAL_ENCRYPTION_KEY", None)

    if not key:
        raise ValueError(
            "CLOUD_CREDENTIAL_ENCRYPTION_KEY is missing. "
            "Set it in .env (local) or Render environment variables."
        )

    # Ensure correct format
    if isinstance(key, str):
        key_bytes = key.encode("utf-8")
    else:
        key_bytes = key

    return Fernet(key_bytes)


def encrypt_credentials_dict(credentials: dict[str, Any]) -> str:
    if not isinstance(credentials, dict):
        raise TypeError("credentials must be a dict")
    payload = json.dumps(credentials, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    return _get_fernet().encrypt(payload).decode("utf-8")


def decrypt_credentials_dict(token: str) -> dict[str, Any]:
    if not token:
        return {}
    try:
        raw = _get_fernet().decrypt(token.encode("utf-8"))
    except InvalidToken as exc:
        raise ValueError("Invalid encrypted credentials token") from exc
    value = json.loads(raw.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Decrypted credentials must be a JSON object")
    return value
