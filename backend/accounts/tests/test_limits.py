import pytest
from accounts.models import EmailChallenge
from django.core.cache import cache

from .conftest import PASSWORD

REGISTER = "/api/auth/register/"
MAGIC_REQUEST = "/api/auth/magic/request/"
RESET_REQUEST = "/api/auth/password-reset/request/"
LOGIN = "/api/auth/login/"


@pytest.fixture(autouse=True)
def fresh_cache():
    cache.clear()


def test_only_five_emails_an_hour_go_to_the_same_address_and_the_answer_does_not_change(api, db, mailoutbox):
    answers = [api.post(MAGIC_REQUEST, {"email": "ana@example.com"}, format="json") for _ in range(8)]

    assert {r.status_code for r in answers} == {202}
    assert len({str(r.data) for r in answers}) == 1
    assert len(mailoutbox) == 5


def test_the_limit_is_shared_by_every_kind_of_email(api, make_user, mailoutbox):
    make_user("ana@example.com")

    for _ in range(3):
        api.post(MAGIC_REQUEST, {"email": "ana@example.com"}, format="json")
    for _ in range(3):
        api.post(RESET_REQUEST, {"email": "ana@example.com"}, format="json")
    for _ in range(3):
        api.post(REGISTER, {"email": "ana@example.com", "password": PASSWORD}, format="json")

    assert len(mailoutbox) == 5


def test_other_addresses_are_not_affected_by_someone_elses_limit(api, db, mailoutbox):
    for _ in range(6):
        api.post(MAGIC_REQUEST, {"email": "ana@example.com"}, format="json")

    api.post(MAGIC_REQUEST, {"email": "otra@example.com"}, format="json")

    assert mailoutbox[-1].to == ["otra@example.com"]


def test_a_daily_cap_protects_the_mail_quota(api, db, settings, mailoutbox):
    settings.EMAIL_DAILY_CAP = 3

    for i in range(6):
        api.post(MAGIC_REQUEST, {"email": f"persona{i}@example.com"}, format="json")

    assert len(mailoutbox) == 3


def test_ten_failed_logins_for_an_email_lock_it_for_a_while_even_with_the_right_password(api, make_user):
    make_user("ana@example.com")
    for _ in range(10):
        assert api.post(LOGIN, {"email": "ana@example.com", "password": "incorrecta-123"}, format="json").status_code == 400

    locked = api.post(LOGIN, {"email": "ana@example.com", "password": PASSWORD}, format="json")

    assert locked.status_code == 429
    assert "Demasiados intentos" in locked.data["detail"]


def test_unknown_emails_are_counted_too_so_the_lock_does_not_reveal_which_ones_exist(api, db):
    for _ in range(10):
        api.post(LOGIN, {"email": "nadie@example.com", "password": "incorrecta-123"}, format="json")

    assert api.post(LOGIN, {"email": "nadie@example.com", "password": "otra"}, format="json").status_code == 429


def test_a_successful_login_clears_the_count(api, make_user):
    make_user("ana@example.com")
    for _ in range(9):
        api.post(LOGIN, {"email": "ana@example.com", "password": "incorrecta-123"}, format="json")
    assert api.post(LOGIN, {"email": "ana@example.com", "password": PASSWORD}, format="json").status_code == 200

    for _ in range(9):
        api.post(LOGIN, {"email": "ana@example.com", "password": "incorrecta-123"}, format="json")

    assert api.post(LOGIN, {"email": "ana@example.com", "password": PASSWORD}, format="json").status_code == 200


def test_old_email_records_do_not_count_against_the_hourly_limit(api, db, mailoutbox):
    from datetime import timedelta

    from django.utils import timezone

    for _ in range(5):
        EmailChallenge.issue("ana@example.com", EmailChallenge.MAGIC)
    EmailChallenge.objects.update(created_at=timezone.now() - timedelta(hours=2))

    api.post(MAGIC_REQUEST, {"email": "ana@example.com"}, format="json")

    assert len(mailoutbox) == 1
