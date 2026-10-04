import importlib
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured


def _reload_prod_settings():
    # prod.py does `from .base import *`, so base must be re-imported too —
    # otherwise CORS_ALLOWED_ORIGINS (computed in base.py from os.environ at
    # import time) stays whatever it was on the very first import of this
    # process, ignoring any monkeypatched env var in this test.
    sys.modules.pop("config.settings.base", None)
    sys.modules.pop("config.settings.prod", None)
    return importlib.import_module("config.settings.prod")


def _reload_dev_settings():
    sys.modules.pop("config.settings.base", None)
    sys.modules.pop("config.settings.dev", None)
    return importlib.import_module("config.settings.dev")


def test_prod_settings_require_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("ALLOWED_HOSTS", "example.com")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com")
    with pytest.raises(ImproperlyConfigured, match="DATABASE_URL"):
        _reload_prod_settings()


def test_prod_settings_require_cors_allowed_origins(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@host/db")
    monkeypatch.setenv("ALLOWED_HOSTS", "example.com")
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
    with pytest.raises(ImproperlyConfigured, match="CORS_ALLOWED_ORIGINS"):
        _reload_prod_settings()


def test_prod_settings_enable_connection_health_checks(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@host/db")
    monkeypatch.setenv("ALLOWED_HOSTS", "example.com")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "bucket")
    monkeypatch.setenv("R2_ENDPOINT_URL", "https://acct.r2.cloudflarestorage.com")
    mod = _reload_prod_settings()
    database = mod.DATABASES["default"]
    assert database["CONN_HEALTH_CHECKS"] is True
    assert database["OPTIONS"]["connect_timeout"] == 10


def test_prod_settings_parse_exact_cors_origin_list(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@host/db")
    monkeypatch.setenv("ALLOWED_HOSTS", "example.com")
    monkeypatch.setenv(
        "CORS_ALLOWED_ORIGINS", "https://bandaoriental.xami.uy, https://x.vercel.app"
    )
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "bucket")
    monkeypatch.setenv("R2_ENDPOINT_URL", "https://acct.r2.cloudflarestorage.com")
    mod = _reload_prod_settings()
    assert mod.CORS_ALLOWED_ORIGINS == [
        "https://bandaoriental.xami.uy",
        "https://x.vercel.app",
    ]
    assert getattr(mod, "CORS_ALLOW_ALL_ORIGINS", False) is False


def test_dev_settings_default_cors_matches_nextjs_port(monkeypatch):
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
    mod = _reload_dev_settings()
    assert mod.CORS_ALLOWED_ORIGINS == ["http://localhost:3000"]


def test_dev_settings_secret_key_is_never_empty(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    mod = _reload_dev_settings()
    assert mod.SECRET_KEY


def test_prod_settings_trust_the_proxy_https_header(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@host/db")
    monkeypatch.setenv("ALLOWED_HOSTS", "banda-oriental-backend.onrender.com")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://bandaoriental.xami.uy")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "bucket")
    monkeypatch.setenv("R2_ENDPOINT_URL", "https://acct.r2.cloudflarestorage.com")
    mod = _reload_prod_settings()
    assert mod.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")
    assert mod.CSRF_TRUSTED_ORIGINS == ["https://banda-oriental-backend.onrender.com"]


@pytest.mark.parametrize(
    "missing_var",
    ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_ENDPOINT_URL"],
)
def test_prod_settings_require_each_r2_setting(monkeypatch, missing_var):
    # Without this, a missing R2 var doesn't fail until the first real
    # upload attempt — the S3 client raises `ValueError: Invalid
    # endpoint: ''` deep inside storages/boto3, not at startup like every
    # other required setting (DATABASE_URL, ALLOWED_HOSTS, ...).
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@host/db")
    monkeypatch.setenv("ALLOWED_HOSTS", "example.com")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com")
    all_r2_vars = {
        "R2_ACCESS_KEY_ID": "key",
        "R2_SECRET_ACCESS_KEY": "secret",
        "R2_BUCKET_NAME": "bucket",
        "R2_ENDPOINT_URL": "https://acct.r2.cloudflarestorage.com",
    }
    for name, value in all_r2_vars.items():
        if name == missing_var:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    with pytest.raises(ImproperlyConfigured, match=missing_var):
        _reload_prod_settings()


def _prod_env(monkeypatch, **extra):
    for key, value in {
        "DATABASE_URL": "postgres://user:pass@host/db",
        "ALLOWED_HOSTS": "example.com",
        "CORS_ALLOWED_ORIGINS": "https://example.com",
        "R2_ACCESS_KEY_ID": "key",
        "R2_SECRET_ACCESS_KEY": "secret",
        "R2_BUCKET_NAME": "bucket",
        "R2_ENDPOINT_URL": "https://acct.r2.cloudflarestorage.com",
    }.items():
        monkeypatch.setenv(key, value)
    for key in ("RESEND_API_KEY", "EMAIL_BACKEND", "FRONTEND_URL"):
        monkeypatch.delenv(key, raising=False)
    for key, value in extra.items():
        monkeypatch.setenv(key, value)


def test_prod_sends_no_email_at_all_until_a_provider_is_configured(monkeypatch):
    _prod_env(monkeypatch)

    mod = _reload_prod_settings()

    assert mod.EMAIL_BACKEND == "django.core.mail.backends.dummy.EmailBackend"


def test_prod_uses_resend_when_its_key_is_set(monkeypatch):
    _prod_env(monkeypatch, RESEND_API_KEY="re_123", FRONTEND_URL="https://bandaoriental.xami.uy")

    mod = _reload_prod_settings()

    assert mod.EMAIL_BACKEND == "anymail.backends.resend.EmailBackend"
    assert mod.ANYMAIL["RESEND_API_KEY"] == "re_123"
    assert "anymail" in mod.INSTALLED_APPS


@pytest.mark.parametrize("front", [None, "http://bandaoriental.xami.uy", "http://localhost:3000"])
def test_prod_refuses_to_send_real_email_with_links_that_are_not_https(monkeypatch, front):
    extra = {"RESEND_API_KEY": "re_123"}
    if front:
        extra["FRONTEND_URL"] = front
    _prod_env(monkeypatch, **extra)

    with pytest.raises(ImproperlyConfigured, match="FRONTEND_URL"):
        _reload_prod_settings()


@pytest.mark.parametrize(
    "backend",
    [
        "django.core.mail.backends.console.EmailBackend",
        "django.core.mail.backends.locmem.EmailBackend",
        "django.core.mail.backends.filebased.EmailBackend",
    ],
)
def test_prod_refuses_email_backends_that_leak_or_lose_the_links(monkeypatch, backend):
    # The console backend would print every confirmation link into the production logs.
    _prod_env(monkeypatch, EMAIL_BACKEND=backend, FRONTEND_URL="https://bandaoriental.xami.uy")

    with pytest.raises(ImproperlyConfigured, match="EMAIL_BACKEND"):
        _reload_prod_settings()


def test_prod_warns_loudly_when_email_is_switched_off(monkeypatch, caplog):
    import logging

    _prod_env(monkeypatch)

    with caplog.at_level(logging.WARNING):
        _reload_prod_settings()

    assert "RESEND_API_KEY" in caplog.text


def test_prod_trusts_the_cloudflare_ip_header_by_default(monkeypatch):
    _prod_env(monkeypatch)
    monkeypatch.delenv("TRUST_CLOUDFLARE_IP_HEADER", raising=False)

    assert _reload_prod_settings().TRUST_CLOUDFLARE_IP_HEADER is True


def test_prod_can_turn_that_off(monkeypatch):
    _prod_env(monkeypatch, TRUST_CLOUDFLARE_IP_HEADER="0")

    assert _reload_prod_settings().TRUST_CLOUDFLARE_IP_HEADER is False


def test_dev_does_not_trust_it(monkeypatch):
    monkeypatch.delenv("TRUST_CLOUDFLARE_IP_HEADER", raising=False)

    assert _reload_dev_settings().TRUST_CLOUDFLARE_IP_HEADER is False


def _minimal_prod_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@host/db")
    monkeypatch.setenv("ALLOWED_HOSTS", "example.com")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "bucket")
    monkeypatch.setenv("R2_ENDPOINT_URL", "https://acct.r2.cloudflarestorage.com")


def test_prod_deletes_anonymous_players_idle_for_a_week_unless_told_otherwise(monkeypatch):
    _minimal_prod_env(monkeypatch)
    monkeypatch.delenv("PURGE_ANONYMOUS_AFTER_DAYS", raising=False)

    assert _reload_prod_settings().PURGE_ANONYMOUS_AFTER_DAYS == 7


def test_the_purge_can_be_changed_or_switched_off_from_the_environment(monkeypatch):
    _minimal_prod_env(monkeypatch)
    monkeypatch.setenv("PURGE_ANONYMOUS_AFTER_DAYS", "0")

    assert _reload_prod_settings().PURGE_ANONYMOUS_AFTER_DAYS == 0


def test_dev_and_tests_never_delete_anything_by_themselves():
    from config.settings import base

    assert base.PURGE_ANONYMOUS_AFTER_DAYS == 0


def test_the_project_passes_djangos_own_system_checks():
    """The checks that `migrate` and the server run on start-up (an admin pointing at a field that does not exist, for
    example, only fails there). If they fail the deploy fails, so the tests run them too."""
    from django.core.management import call_command

    call_command("check")
