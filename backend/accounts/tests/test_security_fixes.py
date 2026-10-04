"""Regression tests for what the independent review of deliveries 2 and 3 found."""
import logging
import re
import threading
from unittest.mock import patch

import pytest
from accounts.models import AuthToken, EmailChallenge
from accounts.users import is_confirmed
from django.contrib.auth import get_user_model
from django.core.cache import cache

from .conftest import PASSWORD

User = get_user_model()
REGISTER = "/api/auth/register/"
CONFIRM = "/api/auth/confirm/"
LOGIN = "/api/auth/login/"
MAGIC_REQUEST = "/api/auth/magic/request/"
MAGIC_VERIFY = "/api/auth/magic/verify/"
RESET_REQUEST = "/api/auth/password-reset/request/"
RESET_CONFIRM = "/api/auth/password-reset/confirm/"
ATTACKER_PASSWORD = "clave-del-atacante-99"


@pytest.fixture(autouse=True)
def fresh_cache():
    cache.clear()


def token_from(mail):
    return re.search(r"#token=([\w-]+)", mail.body).group(1)


def post(api, url, **body):
    return api.post(url, body, format="json")


class TestPreRegistrationTakeover:
    def test_registering_leaves_the_account_without_a_usable_password(self, api, db):
        post(api, REGISTER, email="victima@example.com", password=ATTACKER_PASSWORD)

        assert User.objects.get().has_usable_password() is False

    def test_an_attacker_who_registered_first_cannot_log_in_after_the_victim_uses_a_sign_in_link(
        self, api, db, mailoutbox
    ):
        post(api, REGISTER, email="victima@example.com", password=ATTACKER_PASSWORD)
        mailoutbox.clear()
        post(api, MAGIC_REQUEST, email="victima@example.com")
        post(api, MAGIC_VERIFY, token=token_from(mailoutbox[0]))

        attacker = post(api, LOGIN, email="victima@example.com", password=ATTACKER_PASSWORD)

        assert attacker.status_code == 400

    def test_the_attackers_stale_confirmation_link_is_cancelled_when_the_victim_confirms_another_way(
        self, api, db, mailoutbox
    ):
        post(api, REGISTER, email="victima@example.com", password=ATTACKER_PASSWORD)
        confirmation = token_from(mailoutbox[0])
        post(api, MAGIC_REQUEST, email="victima@example.com")
        post(api, MAGIC_VERIFY, token=token_from(mailoutbox[1]))

        late = post(api, CONFIRM, token=confirmation)

        assert late.status_code == 400
        assert post(api, LOGIN, email="victima@example.com", password=ATTACKER_PASSWORD).status_code == 400

    def test_before_confirming_only_the_pending_password_gets_the_confirm_your_email_hint(self, api, db):
        post(api, REGISTER, email="ana@example.com", password=PASSWORD)

        right = post(api, LOGIN, email="ana@example.com", password=PASSWORD)
        wrong = post(api, LOGIN, email="ana@example.com", password="otra-clave-larga-5")

        assert right.status_code == 403 and right.data["code"] == "email_not_confirmed"
        assert wrong.status_code == 400

    def test_confirming_still_applies_the_password_chosen_with_the_link(self, api, db, mailoutbox):
        post(api, REGISTER, email="ana@example.com", password=PASSWORD)

        post(api, CONFIRM, token=token_from(mailoutbox[0]))

        assert post(api, LOGIN, email="ana@example.com", password=PASSWORD).status_code == 200

    def test_a_sign_in_link_for_an_unconfirmed_account_ends_any_session_it_may_have_had(self, api, make_user, mailoutbox):
        user = make_user("ana@example.com", confirmed=False)
        stale = AuthToken.issue(user)
        post(api, MAGIC_REQUEST, email="ana@example.com")

        post(api, MAGIC_VERIFY, token=token_from(mailoutbox[0]))

        assert not AuthToken.objects.filter(key_hash__startswith="").exclude(user=user).exists()
        assert api.get("/api/me/", HTTP_AUTHORIZATION=f"Bearer {stale}").status_code == 401


class TestEmailFailures:
    @pytest.mark.parametrize(
        "url, body",
        [
            (REGISTER, {"email": "nueva@example.com", "password": PASSWORD}),
            (MAGIC_REQUEST, {"email": "nueva@example.com"}),
            (RESET_REQUEST, {"email": "ana@example.com"}),
        ],
    )
    def test_when_the_mail_provider_fails_the_answer_is_still_the_same_202(self, api, make_user, url, body):
        make_user("ana@example.com")

        with patch("accounts.emails.send_mail", side_effect=RuntimeError("provider down")):
            response = api.post(url, body, format="json")

        assert response.status_code == 202

    def test_the_failure_is_logged_without_the_link_or_the_address(self, api, make_user, caplog):
        make_user("ana@example.com")

        with caplog.at_level(logging.ERROR), patch("accounts.emails.send_mail", side_effect=RuntimeError("provider down")):
            post(api, RESET_REQUEST, email="ana@example.com")

        assert "provider down" in caplog.text
        assert "ana@example.com" not in caplog.text and "token=" not in caplog.text


class TestResponseTimeDoesNotRevealAccounts:
    def test_mail_is_sent_in_the_background_when_enabled_so_every_branch_answers_just_as_fast(
        self, api, make_user, settings
    ):
        settings.EMAIL_SEND_IN_BACKGROUND = True
        make_user("ana@example.com")
        release, delivered = threading.Event(), threading.Event()

        def slow_send(*args, **kwargs):
            release.wait(timeout=5)
            delivered.set()

        with patch("accounts.emails.send_mail", side_effect=slow_send):
            response = post(api, RESET_REQUEST, email="ana@example.com")
            answered_before_delivery = not delivered.is_set()
            release.set()
            assert delivered.wait(timeout=5)

        assert response.status_code == 202
        assert answered_before_delivery


class TestMailQuotaCannotBeExhaustedByStrangers:
    def test_requests_for_unknown_addresses_have_their_own_smaller_daily_pool(self, api, make_user, settings, mailoutbox):
        settings.EMAIL_DAILY_CAP = 10
        settings.EMAIL_NEW_ADDRESS_DAILY_CAP = 2
        make_user("ana@example.com")

        for i in range(6):
            post(api, MAGIC_REQUEST, email=f"desconocido{i}@example.com")
        post(api, MAGIC_REQUEST, email="ana@example.com")
        post(api, RESET_REQUEST, email="ana@example.com")

        recipients = [m.to[0] for m in mailoutbox]
        assert recipients.count("ana@example.com") == 2  # people who already have an account are not locked out
        assert sum(r.startswith("desconocido") for r in recipients) == 2

    def test_the_overall_daily_cap_still_applies(self, api, db, settings, mailoutbox):
        settings.EMAIL_DAILY_CAP = 3
        settings.EMAIL_NEW_ADDRESS_DAILY_CAP = 100

        for i in range(6):
            post(api, MAGIC_REQUEST, email=f"persona{i}@example.com")

        assert len(mailoutbox) == 3

    def test_reaching_a_cap_is_logged_so_someone_notices(self, api, db, settings, caplog):
        settings.EMAIL_NEW_ADDRESS_DAILY_CAP = 1

        with caplog.at_level(logging.WARNING):
            for i in range(3):
                post(api, MAGIC_REQUEST, email=f"persona{i}@example.com")

        assert "límite diario" in caplog.text.lower()


class TestMinorFixes:
    def test_deleting_the_account_removes_emailed_links_whatever_the_case_of_the_stored_address(self, api, db):
        from accounts.models import AuthToken

        user = User.objects.create_user("Ana@Example.com", "ana@example.com", PASSWORD)
        EmailChallenge.issue("ana@example.com", EmailChallenge.MAGIC)
        raw = AuthToken.issue(user)

        api.delete("/api/me/", HTTP_AUTHORIZATION=f"Bearer {raw}")

        assert EmailChallenge.objects.count() == 0

    def test_resetting_the_password_cancels_the_other_pending_links(self, api, make_user, mailoutbox):
        make_user("ana@example.com")
        post(api, RESET_REQUEST, email="ana@example.com")
        post(api, RESET_REQUEST, email="ana@example.com")
        post(api, MAGIC_REQUEST, email="ana@example.com")
        first_reset, second_reset, magic = (token_from(m) for m in mailoutbox[:3])

        post(api, RESET_CONFIRM, token=first_reset, password="otra-clave-bien-larga-7")

        assert post(api, RESET_CONFIRM, token=second_reset, password="una-tercera-bien-larga-8").status_code == 400
        assert post(api, MAGIC_VERIFY, token=magic).status_code == 400

    def test_a_new_password_too_similar_to_the_email_is_rejected_without_using_up_the_link(self, api, make_user, mailoutbox):
        make_user("ana.martinez@example.com")
        post(api, RESET_REQUEST, email="ana.martinez@example.com")
        token = token_from(mailoutbox[0])

        weak = post(api, RESET_CONFIRM, token=token, password="ana.martinez@example.com")
        good = post(api, RESET_CONFIRM, token=token, password="otra-clave-bien-larga-7")

        assert weak.status_code == 400 and "password" in weak.data
        assert good.status_code == 200

    def test_the_confirmation_email_warns_that_someone_else_may_have_requested_it(self, api, db, mailoutbox):
        post(api, REGISTER, email="ana@example.com", password=PASSWORD)

        assert "no fuiste vos" in mailoutbox[0].body.lower()
        assert "contraseña" in mailoutbox[0].body.lower()
