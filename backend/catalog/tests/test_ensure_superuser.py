import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

User = get_user_model()


@pytest.mark.django_db
def test_ensure_superuser_creates_one_from_env(monkeypatch):
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", "brandon@example.com")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "a-real-password")
    call_command("ensure_superuser")
    user = User.objects.get(email="brandon@example.com")
    assert user.is_superuser
    assert user.is_staff


@pytest.mark.django_db
def test_ensure_superuser_is_idempotent(monkeypatch):
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", "brandon@example.com")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "a-real-password")
    call_command("ensure_superuser")
    call_command("ensure_superuser")
    assert User.objects.filter(email="brandon@example.com").count() == 1


@pytest.mark.django_db
def test_ensure_superuser_skips_quietly_without_env(monkeypatch, capsys):
    monkeypatch.delenv("DJANGO_SUPERUSER_EMAIL", raising=False)
    monkeypatch.delenv("DJANGO_SUPERUSER_PASSWORD", raising=False)
    call_command("ensure_superuser")  # must not raise
    assert User.objects.count() == 0
