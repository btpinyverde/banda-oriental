from django.urls import path

from .views import (
    ConfirmView,
    LoginView,
    LogoutView,
    MagicRequestView,
    MagicVerifyView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
)

app_name = "accounts"

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/confirm/", ConfirmView.as_view(), name="confirm"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/magic/request/", MagicRequestView.as_view(), name="magic-request"),
    path("auth/magic/verify/", MagicVerifyView.as_view(), name="magic-verify"),
    path("auth/password-reset/request/", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("auth/password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("me/", MeView.as_view(), name="me"),
]
