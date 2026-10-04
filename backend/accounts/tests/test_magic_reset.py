import re

import pytest
from accounts.models import AuthToken, EmailChallenge
from accounts.users import is_confirmed
from django.contrib.auth import get_user_model
from django.core.cache import cache

from .conftest import PASSWORD, auth_header

User = get_user_model()
MAGIC_REQUEST = "/api/auth/magic/request/"
MAGIC_VERIFY = "/api/auth/magic/verify/"
RESET_REQUEST = "/api/auth/password-reset/request/"
RESET_CONFIRM = "/api/auth/password-reset/confirm/"
DETAIL = "Si el correo es válido, te enviamos un mensaje para continuar."
BAD_LINK = {"detail": "El enlace no es válido o venció."}
NEW_PASSWORD = "otra-clave-bien-larga-7"


@pytest.fixture(autouse=True)
def fresh_cache():
    cache.clear()


def token_from(mail):
    return re.search(r"#token=([\w-]+)", mail.body).group(1)


def magic(api, email="ana@example.com"):
    return api.post(MAGIC_REQUEST, {"email": email}, format="json")


def reset(api, email="ana@example.com"):
    return api.post(RESET_REQUEST, {"email": email}, format="json")


class TestMagicLink:
    def test_request_emails_a_sign_in_link_to_a_known_email(self, api, make_user, mailoutbox):
        make_user("ana@example.com")

        response = magic(api)

        assert response.status_code == 202
        assert response.data == {"detail": DETAIL}
        assert len(mailoutbox) == 1
        assert mailoutbox[0].to == ["ana@example.com"]
        assert "/cuenta/entrar#token=" in mailoutbox[0].body
        assert "tipo=acceso" in mailoutbox[0].body

    def test_request_answers_the_same_and_still_emails_an_unknown_email(self, api, db, mailoutbox):
        response = magic(api, email="  Nueva@Example.COM ")

        assert response.status_code == 202
        assert response.data == {"detail": DETAIL}
        assert mailoutbox[0].to == ["nueva@example.com"]
        assert User.objects.count() == 0  # nothing is created until the link is used

    def test_request_for_a_blocked_account_sends_nothing_and_answers_the_same(self, api, make_user, mailoutbox):
        make_user("ana@example.com", active=False)

        response = magic(api)

        assert response.status_code == 202
        assert response.data == {"detail": DETAIL}
        assert mailoutbox == []

    @pytest.mark.parametrize("email", ["no-es-un-correo", "", ("a" * 140) + "@example.com"])
    def test_request_with_an_invalid_email_is_a_400(self, api, db, mailoutbox, email):
        assert magic(api, email=email).status_code == 400
        assert mailoutbox == []

    def test_verify_signs_in_an_existing_account_and_confirms_its_email(self, api, make_user, mailoutbox):
        user = make_user("ana@example.com", confirmed=False)
        magic(api)

        response = api.post(MAGIC_VERIFY, {"token": token_from(mailoutbox[0])}, format="json")

        assert response.status_code == 200
        assert api.get("/api/me/", **auth_header(response.data["token"])).data["email"] == "ana@example.com"
        user.refresh_from_db()
        assert is_confirmed(user) is True

    def test_verify_creates_the_account_the_first_time_and_it_has_no_password_yet(self, api, db, mailoutbox):
        magic(api, email="nueva@example.com")

        response = api.post(MAGIC_VERIFY, {"token": token_from(mailoutbox[0])}, format="json")

        assert response.status_code == 200
        user = User.objects.get(username="nueva@example.com")
        assert user.is_active is True and is_confirmed(user) is True
        assert user.has_usable_password() is False
        login = api.post("/api/auth/login/", {"email": "nueva@example.com", "password": PASSWORD}, format="json")
        assert login.status_code == 400

    def test_a_link_works_only_once(self, api, make_user, mailoutbox):
        make_user("ana@example.com")
        magic(api)
        token = token_from(mailoutbox[0])
        api.post(MAGIC_VERIFY, {"token": token}, format="json")

        again = api.post(MAGIC_VERIFY, {"token": token}, format="json")

        assert again.status_code == 400 and again.data == BAD_LINK

    def test_a_confirmation_link_is_not_a_sign_in_link(self, api, db):
        raw = EmailChallenge.issue("ana@example.com", EmailChallenge.CONFIRM)

        assert api.post(MAGIC_VERIFY, {"token": raw}, format="json").status_code == 400
        assert User.objects.count() == 0

    def test_a_link_does_not_unblock_an_account_the_admin_blocked(self, api, make_user, mailoutbox):
        make_user("ana@example.com")
        magic(api)
        token = token_from(mailoutbox[0])
        User.objects.update(is_active=False)

        response = api.post(MAGIC_VERIFY, {"token": token}, format="json")

        assert response.status_code == 400
        assert AuthToken.objects.count() == 0

    @pytest.mark.parametrize("body", [{"token": "inventado"}, {"token": ""}, {}])
    def test_garbage_tokens_are_a_400(self, api, db, body):
        assert api.post(MAGIC_VERIFY, body, format="json").status_code == 400


class TestPasswordReset:
    def test_request_emails_a_reset_link_to_a_confirmed_account(self, api, make_user, mailoutbox):
        make_user("ana@example.com")

        response = reset(api)

        assert response.status_code == 202
        assert response.data == {"detail": DETAIL}
        assert len(mailoutbox) == 1
        assert "tipo=restablecer" in mailoutbox[0].body

    @pytest.mark.parametrize("setup", ["unknown", "unconfirmed", "blocked"])
    def test_request_sends_nothing_otherwise_and_answers_the_same(self, api, make_user, mailoutbox, setup):
        if setup == "unconfirmed":
            make_user("ana@example.com", confirmed=False)
        elif setup == "blocked":
            make_user("ana@example.com", active=False)

        response = reset(api)

        assert response.status_code == 202
        assert response.data == {"detail": DETAIL}
        assert mailoutbox == []

    def test_confirm_changes_the_password_and_signs_out_every_other_session(self, api, make_user, mailoutbox):
        user = make_user("ana@example.com")
        old_session = AuthToken.issue(user)
        reset(api)

        response = api.post(
            RESET_CONFIRM, {"token": token_from(mailoutbox[0]), "password": NEW_PASSWORD}, format="json"
        )

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.check_password(NEW_PASSWORD) and not user.check_password(PASSWORD)
        assert api.get("/api/me/", **auth_header(old_session)).status_code == 401
        assert api.get("/api/me/", **auth_header(response.data["token"])).status_code == 200
        assert AuthToken.objects.count() == 1

    def test_a_weak_password_is_rejected_without_using_up_the_link(self, api, make_user, mailoutbox):
        make_user("ana@example.com")
        reset(api)
        token = token_from(mailoutbox[0])

        weak = api.post(RESET_CONFIRM, {"token": token, "password": "corta1"}, format="json")
        good = api.post(RESET_CONFIRM, {"token": token, "password": NEW_PASSWORD}, format="json")

        assert weak.status_code == 400 and "password" in weak.data
        assert good.status_code == 200

    def test_a_link_works_only_once(self, api, make_user, mailoutbox):
        make_user("ana@example.com")
        reset(api)
        token = token_from(mailoutbox[0])
        api.post(RESET_CONFIRM, {"token": token, "password": NEW_PASSWORD}, format="json")

        again = api.post(RESET_CONFIRM, {"token": token, "password": "una-tercera-clave-9"}, format="json")

        assert again.status_code == 400 and again.data == BAD_LINK

    def test_it_also_sets_the_first_password_of_an_account_created_with_a_sign_in_link(self, api, db, mailoutbox):
        magic(api, email="nueva@example.com")
        api.post(MAGIC_VERIFY, {"token": token_from(mailoutbox[0])}, format="json")
        reset(api, email="nueva@example.com")

        api.post(RESET_CONFIRM, {"token": token_from(mailoutbox[1]), "password": NEW_PASSWORD}, format="json")

        login = api.post("/api/auth/login/", {"email": "nueva@example.com", "password": NEW_PASSWORD}, format="json")
        assert login.status_code == 200

    def test_a_sign_in_link_cannot_reset_a_password(self, api, make_user):
        make_user("ana@example.com")
        raw = EmailChallenge.issue("ana@example.com", EmailChallenge.MAGIC)

        response = api.post(RESET_CONFIRM, {"token": raw, "password": NEW_PASSWORD}, format="json")

        assert response.status_code == 400
        assert User.objects.get().check_password(PASSWORD)

    def test_a_link_does_not_work_for_a_blocked_account(self, api, make_user, mailoutbox):
        make_user("ana@example.com")
        reset(api)
        token = token_from(mailoutbox[0])
        User.objects.update(is_active=False)

        response = api.post(RESET_CONFIRM, {"token": token, "password": NEW_PASSWORD}, format="json")

        assert response.status_code == 400
        assert AuthToken.objects.count() == 0
