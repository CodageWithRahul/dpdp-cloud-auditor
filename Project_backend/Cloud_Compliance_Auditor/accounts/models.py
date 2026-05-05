from django.db import models
from django.contrib.auth.models import User
from .utils.credential_hash import make_credentials_hash
from .utils.credential_crypto import (
    decrypt_credentials_dict,
    encrypt_credentials_dict,
)


class CloudAccount(models.Model):
    PROVIDER_CHOICES = [
        ("AWS", "Amazon Web Services"),
        ("AZURE", "Microsoft Azure"),
        ("GCP", "Google Cloud Platform"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="cloud_accounts"
    )
    provider = models.CharField(max_length=10, choices=PROVIDER_CHOICES)
    account_name = models.CharField(max_length=100)
    account_id = models.CharField(max_length=100, default="", blank=True)
    credentials = models.JSONField(null=True, blank=True)
    credentials_hash = models.CharField(max_length=64, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    _CREDENTIALS_ENC_KEY = "__enc__"
    _CREDENTIALS_VERSION_KEY = "__v__"

    def __str__(self):
        return f"{self.account_name} ({self.provider})"

    @staticmethod
    def normalize_credentials(provider: str, credentials: dict) -> dict:
        provider_value = (provider or "").strip().lower()
        return {"provider": provider_value, "credentials": credentials or {}}

    def set_credentials(self, provider: str, credentials: dict) -> None:
        normalized = self.normalize_credentials(provider, credentials or {})

        # encrypt
        token = encrypt_credentials_dict(normalized["credentials"])

        self.credentials = {
            "provider": normalized["provider"],
            "credentials": {
                self._CREDENTIALS_ENC_KEY: token,
                self._CREDENTIALS_VERSION_KEY: 1,
            },
        }

        # 🔥 ADD THIS (IMPORTANT)
        self.credentials_hash = make_credentials_hash(provider, credentials)

    def get_credentials(self) -> dict:
        """
        Returns decrypted credentials for runtime use.

        Backward compatible:
        - If stored credentials are plaintext dicts, returns them as-is.
        - If stored credentials are encrypted, decrypts them at runtime.
        """

        stored = self.credentials
        if not stored:
            return {}

        if isinstance(stored, dict):
            wrapper = stored.get("credentials")
            if isinstance(wrapper, dict) and self._CREDENTIALS_ENC_KEY in wrapper:
                token = wrapper.get(self._CREDENTIALS_ENC_KEY)
                return decrypt_credentials_dict(token)

            # legacy/plaintext dict storage
            return stored

        # Unexpected shape (e.g., string) -> do not crash callers.
        return {}

    def get_normalized_credentials(self) -> dict:
        stored = self.credentials or {}
        provider_value = ""
        if isinstance(stored, dict):
            provider_value = (
                (stored.get("provider") or self.provider or "").strip().lower()
            )
        else:
            provider_value = (self.provider or "").strip().lower()
        return {"provider": provider_value, "credentials": self.get_credentials()}


class CloudRegion(models.Model):
    cloud_account = models.ForeignKey(
        CloudAccount, on_delete=models.CASCADE, related_name="regions"
    )
    region_name = models.CharField(max_length=50)

    def __str__(self):
        return f"{self.region_name} - {self.cloud_account.account_name}"
