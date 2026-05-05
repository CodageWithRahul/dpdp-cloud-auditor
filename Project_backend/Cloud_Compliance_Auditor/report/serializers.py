from rest_framework import serializers

from scanner.serializers import ScanJobLogSerializer

from .models import ScanResult
from .remediation import build_remediation
from .risk import risk_level, severity_weight as _severity_weight


class ScanResultSerializer(serializers.ModelSerializer):
    """Serialize every field from a compliance scan result."""

    remediation = serializers.SerializerMethodField()
    severity_weight = serializers.SerializerMethodField()
    risk_score = serializers.SerializerMethodField()
    risk_level = serializers.SerializerMethodField()

    # Backward-compatible structured fields for frontend guidance
    recommendation_risk = serializers.SerializerMethodField()
    fix_steps = serializers.SerializerMethodField()
    recommendation_structured = serializers.SerializerMethodField()

    class Meta:
        model = ScanResult
        fields = "__all__"

    def get_remediation(self, obj: ScanResult):
        return build_remediation(
            check_id=getattr(obj, "check_id", None),
            check_title=getattr(obj, "check_title", None),
            service_name=getattr(obj, "service_name", None),
        )

    def get_severity_weight(self, obj: ScanResult) -> int:
        return _severity_weight(getattr(obj, "severity", None))

    def get_risk_score(self, obj: ScanResult) -> float:
        """
        Lightweight scoring for UI sorting/triage.

        - PASS => 0
        - WARNING => 0.5 * severity_weight
        - FAIL => 1.0 * severity_weight
        """

        weight = self.get_severity_weight(obj)
        status = (getattr(obj, "status", "") or "").upper().strip()
        if status == "PASS":
            return 0.0
        if status == "WARNING":
            return round(weight * 0.5, 2)
        return float(weight)

    def get_risk_level(self, obj: ScanResult) -> str:
        return risk_level(self.get_risk_score(obj))

    def _get_remediation_cached(self, obj: ScanResult) -> dict | None:
        # Avoid recomputing build_remediation for multiple serializer fields.
        if not hasattr(self, "_remediation_cache"):
            self._remediation_cache = {}
        cache = self._remediation_cache
        key = getattr(obj, "id", None) or id(obj)
        if key not in cache:
            cache[key] = self.get_remediation(obj)
        return cache[key]

    def get_recommendation_risk(self, obj: ScanResult) -> str:
        remediation = self._get_remediation_cached(obj) or {}
        return remediation.get("risk") or ""

    def get_fix_steps(self, obj: ScanResult) -> list[str]:
        remediation = self._get_remediation_cached(obj) or {}
        steps = remediation.get("steps") or []
        return list(steps) if isinstance(steps, (list, tuple)) else []

    def get_recommendation_structured(self, obj: ScanResult) -> dict:
        remediation = self._get_remediation_cached(obj) or {}
        return {
            "description": getattr(obj, "description", "") or "",
            "risk": remediation.get("risk") or "",
            "fix_steps": remediation.get("steps") or [],
            "effort": remediation.get("difficulty") or "",
            "estimated_time": remediation.get("estimated_time") or "",
        }


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
