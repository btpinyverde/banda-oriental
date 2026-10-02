import pytest
from django.contrib.auth import get_user_model
from django.test import Client, override_settings
from django.urls import reverse

User = get_user_model()


def _attempt_admin_login():
    """Simulates exactly how Render's TLS-terminating proxy forwards a
    request: plain HTTP to gunicorn, with X-Forwarded-Proto: https and an
    Origin header the real browser would send over HTTPS."""
    User.objects.create_superuser(username="a@example.com", email="a@example.com", password="pw")
    client = Client(enforce_csrf_checks=True)

    get_response = client.get(reverse("admin:login"), HTTP_X_FORWARDED_PROTO="https")
    csrf_token = get_response.cookies["csrftoken"].value

    return client.post(
        reverse("admin:login"),
        {
            "username": "a@example.com",
            "password": "pw",
            "csrfmiddlewaretoken": csrf_token,
            "next": "/admin/",
        },
        HTTP_X_FORWARDED_PROTO="https",
        HTTP_ORIGIN="https://testserver",
    )


@pytest.mark.django_db
def test_admin_login_fails_behind_proxy_without_trusting_the_header():
    # Reproduces the real bug: without SECURE_PROXY_SSL_HEADER, Django never
    # learns the original request was HTTPS, so CSRF's Origin check (which
    # compares against what it thinks the scheme is) rejects a real
    # browser's https:// Origin.
    response = _attempt_admin_login()
    assert response.status_code == 403


@pytest.mark.django_db
@override_settings(
    SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
    CSRF_TRUSTED_ORIGINS=["https://testserver"],
)
def test_admin_login_succeeds_behind_proxy_once_header_is_trusted():
    response = _attempt_admin_login()
    assert response.status_code == 302
