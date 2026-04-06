from django.db import models

from scanner.models import ScanJob


class ScanResult(models.Model):
    """A granular compliance check outcome for a ScanJob."""

    STATUS_CHOICES = [
        ("PASS", "Pass"),
        ("FAIL", "Fail"),
        ("WARNING", "Warning"),
    ]

    SEVERITY_CHOICES = [
        ("LOW", "Low"),
        ("MEDIUM", "Medium"),
        ("HIGH", "High"),
        ("CRITICAL", "Critical"),
    ]

    scan_job = models.ForeignKey(
        ScanJob, on_delete=models.CASCADE, related_name="scan_results"
    )
    service_name = models.CharField(max_length=100)
    check_id = models.CharField(max_length=100)
    check_title = models.CharField(max_length=255)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES)
    region = models.CharField(max_length=100, null=True, blank=True)
    resource_id = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField()
    recommendation = models.TextField()
    raw_result = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["scan_job"]),
            models.Index(fields=["status"]),
            models.Index(fields=["severity"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.service_name}:{self.check_id} ({self.status})"
