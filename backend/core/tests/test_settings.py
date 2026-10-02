import importlib
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured


def _reload_prod_settings():
    sys.modules.pop("config.settings.prod", None)
    return importlib.import_module("config.settings.prod")


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
