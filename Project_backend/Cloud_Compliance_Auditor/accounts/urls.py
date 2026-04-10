from django.contrib.auth import views as auth_views
from django.urls import path, reverse_lazy
from .views import (
    ChangePasswordView,
    CloudAccountDetailView,
    CloudAccountListCreateView,
    CloudAccountRegionsView,
    ConnectionStatusView,
    ForgotPasswordView,
    RegisterView,
    UserProfileView,
)
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path("password-reset/", ForgotPasswordView.as_view(), name="password_reset_request"),
    path(
        "password-reset/done/",
        auth_views.PasswordResetDoneView.as_view(
            template_name="registration/password_reset_done.html"
        ),
        name="password_reset_done",
    ),
    path(
        "reset/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(
            template_name="registration/password_reset_confirm.html",
            success_url=reverse_lazy("password_reset_complete"),
        ),
        name="password_reset_confirm",
    ),
    path(
        "reset/done/",
        auth_views.PasswordResetCompleteView.as_view(
            template_name="registration/password_reset_complete.html"
        ),
        name="password_reset_complete",
    ),
    path("register/", RegisterView.as_view()),
    path("me/", UserProfileView.as_view()),
    path("cloud-accounts/", CloudAccountListCreateView.as_view()),
    path("cloud-accounts/<int:pk>/", CloudAccountDetailView.as_view()),
    path("cloud-accounts/<int:pk>/connection-status/", ConnectionStatusView.as_view()),
    path("change-password/", ChangePasswordView.as_view()),
    path("<int:pk>/regions/", CloudAccountRegionsView.as_view()),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]
