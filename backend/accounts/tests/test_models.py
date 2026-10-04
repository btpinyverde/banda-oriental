from datetime import timedelta

import pytest
from accounts.models import AuthToken, EmailChallenge, hash_token
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user("ana@example.com", "ana@example.com", "una-clave-larga-1")


def test_issue_returns_the_raw_token_and_stores_only_its_hash(user):
    raw = AuthToken.issue(user)

    stored = AuthToken.objects.get(user=user)
    assert stored.key_hash == hash_token(raw)
    assert raw not in stored.key_hash
    assert len(raw) >= 40


def test_a_token_unused_for_91_days_is_expired(user):
    AuthToken.issue(user)
    token = AuthToken.objects.get(user=user)

    assert token.is_expired() is False
    token.last_used_at = timezone.now() - timedelta(days=91)
    assert token.is_expired() is True


def test_a_challenge_can_be_consumed_once(user):
    raw = EmailChallenge.issue("ana@example.com", EmailChallenge.CONFIRM)

    first = EmailChallenge.consume(raw, EmailChallenge.CONFIRM)
    second = EmailChallenge.consume(raw, EmailChallenge.CONFIRM)

    assert first is not None and first.email == "ana@example.com"
    assert second is None


def test_a_challenge_is_stored_hashed(db):
    raw = EmailChallenge.issue("ana@example.com", EmailChallenge.CONFIRM)

    assert EmailChallenge.objects.get().token_hash == hash_token(raw)


def test_a_challenge_does_not_work_for_another_purpose(db):
    raw = EmailChallenge.issue("ana@example.com", EmailChallenge.CONFIRM)

    assert EmailChallenge.consume(raw, EmailChallenge.RESET) is None
    # Y el intento equivocado no lo gasta.
    assert EmailChallenge.consume(raw, EmailChallenge.CONFIRM) is not None


def test_an_expired_challenge_is_rejected(db):
    raw = EmailChallenge.issue("ana@example.com", EmailChallenge.CONFIRM)
    EmailChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    assert EmailChallenge.consume(raw, EmailChallenge.CONFIRM) is None


def test_confirm_links_last_24_hours_and_the_others_15_minutes(db):
    EmailChallenge.issue("a@example.com", EmailChallenge.CONFIRM)
    EmailChallenge.issue("b@example.com", EmailChallenge.MAGIC)

    confirm = EmailChallenge.objects.get(email="a@example.com")
    magic = EmailChallenge.objects.get(email="b@example.com")
    # created_at and expires_at are set a few microseconds apart, so compare with a tolerance.
    assert abs(confirm.expires_at - confirm.created_at - timedelta(hours=24)) < timedelta(seconds=1)
    assert abs(magic.expires_at - magic.created_at - timedelta(minutes=15)) < timedelta(seconds=1)
