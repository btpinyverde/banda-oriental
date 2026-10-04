import pytest
from accounts.users import mark_confirmed
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()
PASSWORD = "una-clave-larga-1"


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def make_user(db):
    def _make(email="ana@example.com", password=PASSWORD, active=True, confirmed=True):
        """`active` is the admin's on/off switch; `confirmed` says the owner proved they read that mailbox."""
        user = User.objects.create_user(email, email, password, is_active=active)
        if confirmed:
            mark_confirmed(user)
        return user

    return _make


def auth_header(raw_token):
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}
