from django.urls import path
from .views import (
    CloudAccountListCreateView,
    RegisterView,
    CloudAccountRegionsView,
    UserProfileView,
    ChangePasswordView,
    ConnectionStatusView,
)
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("me/", UserProfileView.as_view()),
    path("cloud-accounts/", CloudAccountListCreateView.as_view()),
    path("cloud-accounts/<int:pk>/connection-status/", ConnectionStatusView.as_view()),
    path("change-password/", ChangePasswordView.as_view()),
    path("<int:pk>/regions/", CloudAccountRegionsView.as_view()),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]
