from django.db import models
from accounts.models import CloudAccount


class ScanJob(models.Model):

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("RUNNING", "Running"),
        ("COMPLETED", "Completed"),
        ("FAILED", "Failed"),
        ("INTERRUPTED", "Interrupted"),
    ]

    cloud_account = models.ForeignKey(
        CloudAccount, on_delete=models.CASCADE, related_name="scan_jobs"
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")

    total_resources = models.IntegerField(default=0)
    issues_found = models.IntegerField(default=0)
    target_regions = models.JSONField(default=list, blank=True)
    cancel_requested = models.BooleanField(default=False)

    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def log(self, message, level="INFO"):
        """Persist an operational log entry for this scan job."""

        return ScanJobLog.objects.create(scan_job=self, level=level, message=message)

    def _extract_target_regions_from_message(self, message: str | None) -> str | None:
        if not message:
            return None

        try:
            _, payload = message.split("Target regions:", 1)
        except ValueError:
            return None

        payload = payload.strip().rstrip(".")
        return payload or None

    def target_regions_text(self) -> str | None:
        logs = getattr(self, "target_region_logs", None)
        log_message = None

        if logs:
            log_message = logs[0].message
        else:
            target_log = (
                self.logs.filter(message__startswith="Target regions:")
                .only("message")
                .order_by("created_at")
                .first()
            )
            log_message = target_log.message if target_log else None

        if self.target_regions:
            return ", ".join(self.target_regions)

        extracted = self._extract_target_regions_from_message(log_message)
        if extracted:
            return extracted

        region_names = [
            region.region_name.strip()
            for region in self.cloud_account.regions.all()
            if region.region_name
        ]
        return ", ".join(region_names) if region_names else None


class Finding(models.Model):

    SEVERITY_CHOICES = [
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
        ("CRITICAL", "Critical"),
    ]

    scan_job = models.ForeignKey(
        ScanJob, on_delete=models.CASCADE, related_name="findings"
    )

    resource_type = models.CharField(max_length=100)
    resource_id = models.CharField(max_length=200)

    issue_type = models.CharField(max_length=200)

    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES)

    compliance_type = models.CharField(max_length=50)

    region = models.CharField(max_length=100, null=True, blank=True)

    description = models.TextField()
    recommendation = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)


class ScanJobLog(models.Model):

    LEVEL_CHOICES = [
        ("INFO", "Info"),
        ("SUCCESS", "Success"),
        ("WARNING", "Warning"),
        ("ERROR", "Error"),
    ]

    scan_job = models.ForeignKey(
        ScanJob, on_delete=models.CASCADE, related_name="logs"
    )
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default="INFO")
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
