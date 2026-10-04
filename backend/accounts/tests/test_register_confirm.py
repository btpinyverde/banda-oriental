import re
from datetime import timedelta
from unittest.mock import patch

import pytest
from accounts.models import AuthToken, EmailChallenge
from django.contrib.auth import get_user_model
from django.utils import timezone

from .. import views
from .conftest import PASSWORD, auth_header

User = get_user_model()
REGISTER = "/api/auth/register/"
CONFIRM = "/api/auth/confirm/"
DETAIL = "Si el correo es válido, te enviamos un mensaje para continuar."


def token_from(mail):
    return re.search(r"#token=([\w-]+)", mail.body).group(1)


def register(api, email="ana@example.com", password=PASSWORD):
    return api.post(REGISTER, {"email": email, "password": password}, format="json")


def test_register_creates_an_inactive_user_and_emails_a_confirmation_link(api, db, mailoutbox):
    response = register(api)

    assert response.status_code == 202
    assert response.data == {"detail": DETAIL}
    user = User.objects.get(username="ana@example.com")
    assert user.is_active is False
    assert user.check_password(PASSWORD)
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["ana@example.com"]
    assert "/cuenta/entrar#token=" in mailoutbox[0].body
    assert "tipo=confirmar" in mailoutbox[0].body


def test_the_email_is_trimmed_and_lowercased(api, db, mailoutbox):
    register(api, email="  Ana@Example.COM ")

    assert User.objects.get().username == "ana@example.com"
    assert mailoutbox[0].to == ["ana@example.com"]


def test_registering_a_confirmed_email_answers_the_same_and_sends_no_confirmation_link(api, make_user, mailoutbox):
    make_user("ana@example.com")

    response = register(api, password="otra-clave-larga-2")

    assert response.status_code == 202
    assert response.data == {"detail": DETAIL}
    assert User.objects.count() == 1
    assert len(mailoutbox) == 1
    assert "#token=" not in mailoutbox[0].body
    assert not User.objects.get().check_password("otra-clave-larga-2")


def test_registering_an_unconfirmed_email_again_resends_the_link_and_keeps_the_old_password(api, make_user, mailoutbox):
    make_user("ana@example.com", active=False)

    response = register(api, password="clave-del-intruso-9")

    assert response.status_code == 202
    assert len(mailoutbox) == 1
    assert "#token=" in mailoutbox[0].body
    assert User.objects.get().check_password(PASSWORD)
    assert not User.objects.get().check_password("clave-del-intruso-9")


@pytest.mark.parametrize(
    "email, password, field",
    [
        ("no-es-un-correo", PASSWORD, "email"),
        ("", PASSWORD, "email"),
        (("a" * 140) + "@example.com", PASSWORD, "email"),
        ("ana@example.com", "corta1", "password"),
        ("ana@example.com", "1234567890", "password"),
        ("ana@example.com", "", "password"),
    ],
)
def test_invalid_input_is_a_400_on_the_right_field_and_sends_nothing(api, db, mailoutbox, email, password, field):
    response = register(api, email=email, password=password)

    assert response.status_code == 400
    assert field in response.data
    assert User.objects.count() == 0
    assert mailoutbox == []


def test_losing_a_race_for_the_same_email_still_answers_202(api, make_user, mailoutbox):
    # The account already exists, but this request's first lookup ran before it was created and saw nothing.
    make_user("ana@example.com", active=False)
    real_find_user = views.find_user
    stale_answers = [None]

    def stale_then_real(email):
        return stale_answers.pop() if stale_answers else real_find_user(email)

    with patch.object(views, "find_user", side_effect=stale_then_real):
        response = register(api, password="clave-del-intruso-9")

    assert response.status_code == 202
    assert User.objects.count() == 1
    assert User.objects.get().check_password(PASSWORD)
    assert len(mailoutbox) == 1


def test_confirming_activates_the_account_and_returns_a_working_session_token(api, db, mailoutbox):
    register(api)

    response = api.post(CONFIRM, {"token": token_from(mailoutbox[0])}, format="json")

    assert response.status_code == 200
    assert User.objects.get().is_active is True
    me = api.get("/api/me/", **auth_header(response.data["token"]))
    assert me.status_code == 200
    assert me.data["email"] == "ana@example.com"


def test_a_confirmation_link_works_only_once(api, db, mailoutbox):
    register(api)
    token = token_from(mailoutbox[0])
    api.post(CONFIRM, {"token": token}, format="json")

    again = api.post(CONFIRM, {"token": token}, format="json")

    assert again.status_code == 400
    assert again.data == {"detail": "El enlace no es válido o venció."}
    assert AuthToken.objects.count() == 1


def test_an_expired_confirmation_link_is_rejected_and_the_account_stays_inactive(api, db, mailoutbox):
    register(api)
    EmailChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    response = api.post(CONFIRM, {"token": token_from(mailoutbox[0])}, format="json")

    assert response.status_code == 400
    assert User.objects.get().is_active is False


@pytest.mark.parametrize("body", [{"token": "inventado"}, {"token": ""}, {}])
def test_garbage_confirmation_tokens_are_a_400(api, db, body):
    assert api.post(CONFIRM, body, format="json").status_code == 400
