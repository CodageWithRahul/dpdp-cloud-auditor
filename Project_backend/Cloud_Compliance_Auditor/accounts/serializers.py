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

        provider = attrs.get("provider") or (
            self.instance.provider if self.instance is not None else None
        )
        credentials = attrs.get("credentials", {}) or {}

        if self.instance is not None and attrs.get("credentials") is None:
            if "provider" in attrs and attrs["provider"] != self.instance.provider:
                raise serializers.ValidationError(
                    {
                        "credentials": "Credentials are required when changing the provider."
                    }
                )
            return attrs

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

        request = self.context.get("request")
        user = getattr(request, "user", None)

        if self.instance is None and user and user.is_authenticated:
            existing = CloudAccount.objects.filter(
                user=user, provider=provider, is_active=True
            )
            for account in existing:
                if (account.credentials or {}) == credentials:
                    raise serializers.ValidationError(
                        {"credentials": "This cloud account is already added."}
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
    full_name = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["full_name", "email", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def validate_email(self, value):
        if not value:
            raise serializers.ValidationError("Email is required.")
        normalized = value.lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError(
                "An account with this email already exists. | Try login instead."
            )
        return normalized

    def create(self, validated_data):
        full_name = validated_data.pop("full_name", "")
        email = validated_data.get("email")
        password = validated_data.get("password")
        user = User.objects.create_user(username=email, email=email, password=password)
        if full_name:
            names = full_name.split(None, 1)
            user.first_name = names[0]
            user.last_name = names[1] if len(names) > 1 else ""
            user.save()
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = "__all__"


class UserUpdateSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = ("email", "full_name")

    def validate_email(self, value):
        normalized = value.lower()
        user = getattr(self, "instance", None)
        if User.objects.filter(email__iexact=normalized).exclude(id=user.id if user else None).exists():
            raise serializers.ValidationError("This email is already taken.")
        return normalized

    def update(self, instance, validated_data):
        full_name = validated_data.pop("full_name", None)
        email = validated_data.get("email")

        if full_name is not None:
            names = full_name.strip().split(None, 1)
            instance.first_name = names[0] if names else ""
            instance.last_name = names[1] if len(names) > 1 else ""

        if email:
            normalized_email = email.lower()
            instance.email = normalized_email
            instance.username = normalized_email

        instance.save()
        return instance
