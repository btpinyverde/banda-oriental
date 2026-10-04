from django.urls import path

from .views import ConfirmView, MeView, RegisterView

app_name = "accounts"

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/confirm/", ConfirmView.as_view(), name="confirm"),
    path("me/", MeView.as_view(), name="me"),
]
