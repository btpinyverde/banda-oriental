"""Who may create battles. Joining and playing stay open to whoever has the room's code; only creating is restricted."""
import pytest
from django.urls import reverse

from accounts.models import AuthToken
from battles.access import can_create
from battles.models import Battle

D1 = "11111111-1111-1111-1111-111111111111"
ALLOWED = "btpinyverde@gmail.com"


@pytest.fixture
def allowed_only(settings):
    settings.BATTLES = {**settings.BATTLES, "CREATOR_EMAILS": [ALLOWED]}


def user_with(django_user_model, email):
    return django_user_model.objects.create_user(username=email, email=email, password="x" * 12)


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AuthToken.issue(user)}"}


def create(client, **extra):
    return client.post(reverse("battles:create"), data={}, content_type="application/json", HTTP_X_DEVICE_ID=D1, **extra)


def test_only_listed_emails_can_create_ignoring_case(allowed_only, django_user_model):
    assert can_create(user_with(django_user_model, "BtPinyVerde@Gmail.com"))
    assert not can_create(user_with(django_user_model, "otra@gmail.com"))


def test_anonymous_visitors_cannot_create(allowed_only):
    from django.contrib.auth.models import AnonymousUser

    assert not can_create(AnonymousUser())
    assert not can_create(None)


def test_a_star_opens_it_to_everybody_including_anonymous(settings, django_user_model):
    from django.contrib.auth.models import AnonymousUser

    settings.BATTLES = {**settings.BATTLES, "CREATOR_EMAILS": ["*"]}
    assert can_create(AnonymousUser()) and can_create(user_with(django_user_model, "cualquiera@x.uy"))


def test_an_empty_list_means_nobody(settings, django_user_model):
    settings.BATTLES = {**settings.BATTLES, "CREATOR_EMAILS": []}
    assert not can_create(user_with(django_user_model, ALLOWED))


def test_the_endpoint_hides_itself_from_anonymous_and_other_accounts(client, allowed_only, django_user_model):
    assert create(client).status_code == 404
    assert create(client, **bearer(user_with(django_user_model, "otra@gmail.com"))).status_code == 404
    assert Battle.objects.count() == 0


def test_the_allowed_account_creates_a_battle_it_hosts(client, allowed_only, django_user_model):
    user = user_with(django_user_model, ALLOWED)
    r = create(client, **bearer(user))
    assert r.status_code == 201
    assert Battle.objects.get(code=r.json()["code"]).host_user == user


def test_me_tells_the_site_whether_the_account_can_create_battles(client, allowed_only, django_user_model):
    yes, no = user_with(django_user_model, ALLOWED), user_with(django_user_model, "otra@gmail.com")
    assert client.get("/api/me/", **bearer(yes)).json()["can_create_battles"] is True
    assert client.get("/api/me/", **bearer(no)).json()["can_create_battles"] is False
