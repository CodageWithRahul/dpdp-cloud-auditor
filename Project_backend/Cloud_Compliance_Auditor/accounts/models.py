from django.db import models
from django.contrib.auth.models import User


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
    credentials = models.JSONField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.account_name} ({self.provider})"


class CloudRegion(models.Model):
    cloud_account = models.ForeignKey(
        CloudAccount, on_delete=models.CASCADE, related_name="regions"
    )
    region_name = models.CharField(max_length=50)

    def __str__(self):
        return f"{self.region_name} - {self.cloud_account.account_name}"
