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
    mod = _reload_prod_settings()
    assert mod.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")
    assert mod.CSRF_TRUSTED_ORIGINS == ["https://banda-oriental-backend.onrender.com"]
