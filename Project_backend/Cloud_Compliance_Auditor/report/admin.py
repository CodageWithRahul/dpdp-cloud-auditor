from django.contrib import admin

from .models import ScanResult


@admin.register(ScanResult)
class ScanResultAdmin(admin.ModelAdmin):
    """Manage compliance check results in the Django admin."""

    list_display = (
        "scan_job",
        "service_name",
        "check_id",
        "status",
        "severity",
        "created_at",
    )
    list_filter = ("status", "severity", "service_name")
    search_fields = ("service_name", "check_id", "resource_id")
