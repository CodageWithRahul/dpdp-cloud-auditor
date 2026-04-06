from rest_framework import serializers

from scanner.serializers import ScanJobLogSerializer

from .models import ScanResult


class ScanResultSerializer(serializers.ModelSerializer):
    """Serialize every field from a compliance scan result."""

    class Meta:
        model = ScanResult
        fields = "__all__"


class UserInfoSerializer(serializers.Serializer):
    """Serialize a lightweight representation of a user."""

    username = serializers.CharField()
    full_name = serializers.CharField()
    email = serializers.CharField()


class ReportSummarySerializer(serializers.Serializer):
    """Serialize the aggregated scan summary shown on the report dashboard."""

    scan_job_id = serializers.IntegerField()
    scan_date = serializers.DateTimeField()
    report_generated_at = serializers.DateTimeField()
    generated_by = serializers.CharField()
    cloud_account_id = serializers.IntegerField(allow_null=True)
    cloud_account_name = serializers.CharField(allow_null=True)
    cloud_account_provider = serializers.CharField(allow_null=True)
    requested_by = UserInfoSerializer()
    total_checks = serializers.IntegerField()
    passed = serializers.IntegerField()
    failed = serializers.IntegerField()
    warnings = serializers.IntegerField()
    severity_count = serializers.DictField(child=serializers.IntegerField())
    scan_regions = serializers.ListField(
        child=serializers.CharField(), allow_empty=True
    )
    scan_logs = ScanJobLogSerializer(many=True)
