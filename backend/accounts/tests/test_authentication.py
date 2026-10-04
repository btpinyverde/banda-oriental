from datetime import timedelta

import pytest
from accounts.models import AuthToken
from django.utils import timezone

from .conftest import auth_header

ME = "/api/me/"


def test_me_requires_a_token(api, db):
    response = api.get(ME)

    assert response.status_code == 401
    assert response["WWW-Authenticate"] == "Bearer"


def test_me_returns_the_account_for_a_valid_token(api, make_user):
    user = make_user("ana@example.com")
    raw = AuthToken.issue(user)

    response = api.get(ME, **auth_header(raw))

    assert response.status_code == 200
    assert response.data["email"] == "ana@example.com"
    assert "date_joined" in response.data


@pytest.mark.parametrize(
    "header",
    ["Bearer", "Bearer a b", "Bearer token-inventado", "Basic abc123", "abc"],
)
def test_a_malformed_or_unknown_authorization_header_is_a_401_never_a_500(api, db, header):
    response = api.get(ME, HTTP_AUTHORIZATION=header)

    assert response.status_code == 401


def test_the_token_of_an_inactive_user_is_rejected(api, make_user):
    user = make_user(active=False)
    raw = AuthToken.issue(user)

    assert api.get(ME, **auth_header(raw)).status_code == 401


def test_a_token_unused_for_91_days_is_rejected(api, make_user):
    raw = AuthToken.issue(make_user())
    AuthToken.objects.update(last_used_at=timezone.now() - timedelta(days=91))

    assert api.get(ME, **auth_header(raw)).status_code == 401


def test_using_a_token_refreshes_last_used_only_when_it_is_over_an_hour_old(api, make_user):
    raw = AuthToken.issue(make_user())
    recent = timezone.now() - timedelta(minutes=10)
    AuthToken.objects.update(last_used_at=recent)
    api.get(ME, **auth_header(raw))
    assert AuthToken.objects.get().last_used_at == recent

    old = timezone.now() - timedelta(days=3)
    AuthToken.objects.update(last_used_at=old)
    api.get(ME, **auth_header(raw))
    assert AuthToken.objects.get().last_used_at > old
