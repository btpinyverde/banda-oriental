import pytest
from accounts.models import EmailChallenge
from accounts.users import mark_confirmed
from django.contrib.auth.hashers import make_password
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
        if confirmed:
            user = User.objects.create_user(email, email, password, is_active=active)
            mark_confirmed(user)
            return user
        # Like a real registration: no usable password on the account, the chosen one waits on the link.
        user = User.objects.create_user(email, email, None, is_active=active)
        EmailChallenge.issue(email, EmailChallenge.CONFIRM, make_password(password))
        return user

    return _make


def auth_header(raw_token):
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}
