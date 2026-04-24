from rest_framework import serializers

from .models import Finding, ScanJob, ScanJobLog


class StartScanSerializer(serializers.Serializer):
    cloud_account_id = serializers.IntegerField()
    regions = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
        help_text="Optional explicit region names to target during the scan.",
    )
    scan_all_regions = serializers.BooleanField(
        required=False,
        default=False,
        help_text="If true, ignore explicit regions and scan every region available for the account.",
    )
    region = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Single region name. Use 'ALL' (case-insensitive) to scan every region.",
    )


class ScanJobLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScanJobLog
        fields = ("id", "message", "level", "created_at")


class FindingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Finding
        fields = (
            "id",
            "resource_type",
            "resource_id",
            "issue_type",
            "severity",
            "compliance_type",
            "description",
            "recommendation",
            "region",
            "created_at",
        )


class ScanHistorySerializer(serializers.ModelSerializer):
    scan_id = serializers.IntegerField(source="id")
    cloud_account = serializers.CharField(source="cloud_account.account_name")
    provider = serializers.CharField(source="cloud_account.provider")
    region = serializers.SerializerMethodField()
    start_time = serializers.DateTimeField(source="started_at")
    end_time = serializers.DateTimeField(source="completed_at", allow_null=True)

    class Meta:
        model = ScanJob
        fields = (
            "scan_id",
            "cloud_account",
            "provider",
            "region",
            "start_time",
            "end_time",
            "status",
            "issues_found",
        )

    def get_region(self, obj: ScanJob):
        """
        Return list of regions instead of raw text.
        This keeps the API clean and frontend-friendly.
        """

        region_text = obj.target_regions_text()

        if not region_text:
            return []

        return [r.strip() for r in region_text.split(",") if r.strip()]
