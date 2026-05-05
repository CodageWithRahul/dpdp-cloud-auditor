from django.conf import settings
from django.contrib.auth.forms import PasswordResetForm
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.generics import RetrieveUpdateAPIView
from .services.validator_selector import validate_credentials
from .services.region_selector import get_regions
from rest_framework_simplejwt.views import TokenObtainPairView


from .models import CloudAccount
from .serializers import (
    CloudAccountSerializer,
    UserRegisterSerializer,
    UserSerializer,
    UserUpdateSerializer,
)


class RegisterView(APIView):
    serializer_class = UserRegisterSerializer

    def post(self, request):
        serializer = UserRegisterSerializer(data=request.data)

        if serializer.is_valid():
            # email = request.data.get("email")
            # user = serializer.save(commit=False)
            # user.username = email
            # user.save()
            serializer.save()

            return Response({"message": "User created successfully"}, status=201)

        return Response(serializer.errors, status=400)


class CloudAccountListCreateView(APIView):
    serializer_class = CloudAccountSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request):
        accounts = CloudAccount.objects.filter(user=request.user, is_active=True)

        serializer = self.serializer_class(accounts, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = self.serializer_class(
            data=request.data, context={"request": request}
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # 🔥 validate credentials BEFORE saving (provider-specific check)
        provider = serializer.validated_data.get("provider")
        credentials = serializer.validated_data.get("credentials") or {}

        is_valid, error = validate_credentials(provider, credentials)

        if not is_valid:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        # 🔥 ALL logic (duplicate check + encryption + hash) handled inside serializer
        account = serializer.save(user=request.user)

        return Response(
            self.serializer_class(account).data, status=status.HTTP_201_CREATED
        )


class CloudAccountDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        try:
            return CloudAccount.objects.get(id=pk, user=request.user)
        except CloudAccount.DoesNotExist:
            return None

    def get(self, request, pk):
        account = self.get_object(request, pk)
        if not account:
            return Response({"detail": "Account not found"}, status=404)

        serializer = CloudAccountSerializer(account)
        return Response(serializer.data)

    def patch(self, request, pk):
        account = self.get_object(request, pk)
        if not account:
            return Response({"detail": "Account not found"}, status=404)

        serializer = CloudAccountSerializer(
            account, data=request.data, partial=True, context={"request": request}
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        account = self.get_object(request, pk)
        if not account:
            return Response({"detail": "Account not found"}, status=404)

        # Soft delete (recommended)
        account.is_active = False
        account.save()

        return Response({"message": "Account deactivated successfully"}, status=200)


class CloudAccountRegionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            account = CloudAccount.objects.get(id=pk, user=request.user)
        except CloudAccount.DoesNotExist:
            return Response({"error": "Cloud account not found"}, status=404)

        regions, error = get_regions(account.provider, account.get_credentials() or {})

        if error:
            return Response({"error": error}, status=400)

        return Response(regions, status=200)


class UserProfileView(RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return UserUpdateSerializer
        return UserSerializer

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            self.get_object(), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(self.get_object()).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        old_password = request.data.get("old_password")
        new_password = request.data.get("new_password")

        if not user.check_password(old_password):
            return Response(
                {"error": "Old password is incorrect"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()

        return Response({"message": "Password changed successfully"})


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")

        if not email:
            return Response(
                {"error": "Email is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        form = PasswordResetForm(data={"email": email})

        if form.is_valid():
            form.save(
                request=request,
                use_https=request.is_secure(),
                from_email=settings.DEFAULT_FROM_EMAIL,
                email_template_name="registration/password_reset_email.html",
                subject_template_name="registration/password_reset_subject.txt",
            )

        return Response(
            {
                "message": "If an account exists for that email, we have sent password reset instructions."
            }
        )


class ConnectionStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            account = CloudAccount.objects.get(id=pk, user=request.user)

            credentials = account.get_credentials() or {}
            is_valid, error = validate_credentials(account.provider, credentials)
            regions, regions_error = get_regions(account.provider, credentials)
            regions = regions or []
            return Response(
                {
                    "is_connected": is_valid,
                    "connection_status": "Connected" if is_valid else "Not connected",
                    "connection_issue": error,
                    "regions": regions,
                    "regions_issue": regions_error,
                }
            )

        except CloudAccount.DoesNotExist:
            return Response({"detail": "Account not found"}, status=404)
