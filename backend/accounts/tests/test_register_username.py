"""The username chosen when creating the account is the public name of the rankings. It is checked when registering (so the
person finds out at once if it is taken or not allowed) and set when the email is confirmed; if somebody took it in between,
the account is created anyway, without a name (it is chosen when saving the first score, as always)."""

import re

import pytest
from django.contrib.auth import get_user_model

from accounts.models import EmailChallenge
from gameplay.models import PlayerStats

from .conftest import PASSWORD

User = get_user_model()
REGISTER = "/api/auth/register/"
CONFIRM = "/api/auth/confirm/"


def token_from(mail):
    return re.search(r"#token=([\w-]+)", mail.body).group(1)


def register(api, **extra):
    body = {"email": "ana@example.com", "password": PASSWORD, "accepts_terms": True, **extra}
    return api.post(REGISTER, body, format="json")


def confirm(api, mailoutbox):
    return api.post(CONFIRM, {"token": token_from(mailoutbox[-1])}, format="json")


def name_of(email="ana@example.com"):
    row = PlayerStats.objects.filter(user__username=email).first()
    return row.public_name if row else None


class TestChoosingAUsername:
    def test_the_name_chosen_when_registering_is_the_public_name_once_the_email_is_confirmed(self, api, db, mailoutbox):
        assert register(api, public_name="BrandonT").status_code == 202

        assert name_of() is None  # nothing is set until the mailbox is confirmed
        assert confirm(api, mailoutbox).status_code == 200
        assert name_of() == "BrandonT"

    def test_it_is_optional(self, api, db, mailoutbox):
        register(api)
        confirm(api, mailoutbox)

        assert name_of() is None

    @pytest.mark.parametrize("value", ["", "   "])
    def test_an_empty_name_is_the_same_as_none(self, api, db, mailoutbox, value):
        assert register(api, public_name=value).status_code == 202
        confirm(api, mailoutbox)

        assert name_of() is None

    def test_spaces_around_it_are_trimmed(self, api, db, mailoutbox):
        register(api, public_name="  Brandon T  ")
        confirm(api, mailoutbox)

        assert name_of() == "Brandon T"


class TestWhatIsNotAccepted:
    def test_a_name_already_taken_whatever_the_case_is_refused_with_a_clear_message(self, api, db):
        PlayerStats.objects.create(device_id="x", public_name="BrandonT")

        response = register(api, public_name="brandont")

        assert response.status_code == 400
        assert "ya está en uso" in str(response.json())
        assert not EmailChallenge.objects.exists()  # nothing was sent

    def test_a_name_that_is_too_long_is_refused(self, api, db):
        assert register(api, public_name="x" * 51).status_code == 400

    def test_a_name_with_a_banned_word_is_refused(self, api, db, monkeypatch):
        from accounts import serializers

        monkeypatch.setattr(serializers, "contains_banned_word", lambda text: "malapalabra" in text.lower())

        assert register(api, public_name="Una Malapalabra").status_code == 400

    @pytest.mark.parametrize("value", [123, ["a"], {"a": 1}, True])
    def test_it_has_to_be_text(self, api, db, value):
        assert register(api, public_name=value).status_code == 400

    def test_a_control_character_in_the_name_is_refused(self, api, db):
        assert register(api, public_name="Ana\x00").status_code == 400
        assert register(api, public_name="An\na").status_code == 400

    def test_whether_the_email_already_has_an_account_is_still_not_revealed(self, api, db, mailoutbox, make_user):
        make_user("ana@example.com")

        existing = register(api, public_name="NombreLibre")
        new = register(api, email="otra@example.com", public_name="NombreLibre2")

        assert existing.status_code == new.status_code == 202
        assert existing.json() == new.json()


class TestWhenSomebodyTakesItInBetween:
    def test_the_account_is_created_anyway_without_the_name(self, api, db, mailoutbox):
        register(api, public_name="BrandonT")
        PlayerStats.objects.create(device_id="otro", public_name="BrandonT")  # taken before confirming

        response = confirm(api, mailoutbox)

        assert response.status_code == 200
        assert name_of() is None
        assert User.objects.filter(username="ana@example.com").exists()

    def test_it_never_replaces_a_name_the_account_already_has(self, api, db, mailoutbox):
        register(api, public_name="Primero")
        user = User.objects.get(username="ana@example.com")
        PlayerStats.objects.create(user=user, public_name="YaTenia")

        confirm(api, mailoutbox)

        assert name_of() == "YaTenia"


class TestTheDeviceThatCreatesTheAccount:
    def test_the_name_chosen_when_registering_wins_over_the_one_of_the_device(self, api, db, mailoutbox):
        from accounts.claim import claim_device_games

        PlayerStats.objects.create(device_id="11111111-1111-4111-8111-111111111111", public_name="NombreViejo")
        register(api, public_name="NombreNuevo")
        confirm(api, mailoutbox)
        user = User.objects.get(username="ana@example.com")

        claim_device_games(user, "11111111-1111-4111-8111-111111111111")

        assert name_of() == "NombreNuevo"
