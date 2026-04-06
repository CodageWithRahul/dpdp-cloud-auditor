from rest_framework import serializers
from .models import CloudAccount
from django.contrib.auth.models import User


class CloudAccountSerializer(serializers.ModelSerializer):

    credentials = serializers.DictField(write_only=True)

    class Meta:
        model = CloudAccount
        fields = (
            "id",
            "provider",
            "account_name",
            "credentials",
            "is_active",
            "created_at",
        )
        read_only_fields = ("id", "is_active", "created_at")

    def validate(self, attrs):

        provider = attrs.get("provider")
        credentials = attrs.get("credentials", {}) or {}

        if provider == "AWS":
            required = ["access_key", "secret_key"]

        elif provider == "GCP":
            if "service_account_json" not in credentials:
                credentials = {"service_account_json": credentials}
                attrs["credentials"] = credentials
            required = ["service_account_json"]

        elif provider == "AZURE":
            required = [
                "tenant_id",
                "client_id",
                "client_secret",
                "subscription_id",
            ]

        else:
            raise serializers.ValidationError(
                {"provider": "Unsupported cloud provider"}
            )

        for field in required:
            if field not in credentials:
                raise serializers.ValidationError(
                    {"credentials": f"{field} is required for {provider}"}
                )
        return attrs

    # def get_connection_status(self, obj):
    #     valid = getattr(obj, "is_connection_valid", None)
    #     if valid is False:
    #         return "Not connected"
    #     return "Connected"

    # def get_connection_issue(self, obj):
    #     error = getattr(obj, "connection_issue", None)
    #     return error if error else None

    # def get_is_connected(self, obj):
    #     valid = getattr(obj, "is_connection_valid", None)
    #     return valid if valid is not None else True


class UserRegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["username", "email", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = "__all__"
