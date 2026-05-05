from rest_framework import serializers
from .models import CloudAccount
from django.contrib.auth.models import User
from .utils.credential_hash import make_credentials_hash


class CloudAccountSerializer(serializers.ModelSerializer):

    credentials = serializers.DictField(write_only=True)

    class Meta:
        model = CloudAccount
        fields = (
            "id",
            "provider",
            "account_name",
            "account_id",
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
                if (account.get_credentials() or {}) == credentials:
                    raise serializers.ValidationError(
                        {"credentials": "This cloud account is already added."}
                    )

        return attrs

    def create(self, validated_data):
        credentials = validated_data.pop("credentials", None)
        provider = validated_data.get("provider")
        request = self.context.get("request")
        user = getattr(request, "user", None)

        # 🔥 HASH-BASED DUPLICATE CHECK (ONLY PLACE IT SHOULD EXIST)
        if user and credentials:
            cred_hash = make_credentials_hash(provider, credentials)

            if CloudAccount.objects.filter(
                user=user, provider=provider, credentials_hash=cred_hash
            ).exists():
                raise serializers.ValidationError(
                    {"credentials": "This cloud account is already added."}
                )

        instance = CloudAccount(**validated_data)
        instance.user = user

        if credentials:
            instance.credentials_hash = make_credentials_hash(provider, credentials)
            instance.set_credentials(provider, credentials)

        instance.save()
        return instance

    def update(self, instance, validated_data):
        credentials = validated_data.pop("credentials", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if credentials is not None:
            provider = validated_data.get("provider") or instance.provider

            # 🔥 update hash also when credentials change
            cred_hash = make_credentials_hash(provider, credentials)

            # prevent duplicate on update
            user = instance.user
            if (
                CloudAccount.objects.filter(
                    user=user, provider=provider, credentials_hash=cred_hash
                )
                .exclude(id=instance.id)
                .exists()
            ):
                raise serializers.ValidationError(
                    {"credentials": "This cloud account already exists."}
                )

            instance.credentials_hash = cred_hash
            instance.set_credentials(provider, credentials)

        instance.save()
        return instance


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
        if (
            User.objects.filter(email__iexact=normalized)
            .exclude(id=user.id if user else None)
            .exists()
        ):
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
