from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .services.validator_selector import validate_credentials
from .services.region_selector import get_regions


from .models import CloudAccount
from .serializers import CloudAccountSerializer, UserRegisterSerializer, UserSerializer


class RegisterView(APIView):
    serializer_class = UserRegisterSerializer

    def post(self, request):
        serializer = UserRegisterSerializer(data=request.data)

        if serializer.is_valid():
            serializer.save()
            return Response({"message": "User created successfully"}, status=201)

        return Response(serializer.errors, status=400)


class CloudAccountListCreateView(APIView):
    serializer_class = CloudAccountSerializer
    permission_classes = [IsAuthenticated]

    def get(self, request):
        accounts = CloudAccount.objects.filter(user_id=request.user.id)

        serializer = self.serializer_class(accounts, many=True)

        return Response(serializer.data)

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        credentials = data.get("credentials") or {}

        is_valid, error = validate_credentials(data["provider"], credentials)

        if not is_valid:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CloudAccountRegionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            account = CloudAccount.objects.get(id=pk, user=request.user)
        except CloudAccount.DoesNotExist:
            return Response({"error": "Cloud account not found"}, status=404)

        regions, error = get_regions(account.provider, account.credentials or {})

        if error:
            return Response({"error": error}, status=400)

        return Response(regions, status=200)


class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        print("user details :", request.user.username)
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


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


class ConnectionStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            account = CloudAccount.objects.get(id=pk, user=request.user)

            credentials = account.credentials or {}
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
