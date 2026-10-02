import os

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

# Safe here (unlike in base.py/dev.py): Render's buildCommand always runs
# `collectstatic` before the app starts, so the manifest this storage needs
# always exists by the time a real request comes in.
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise ImproperlyConfigured(
        "DATABASE_URL is required in production and was not set."
    )

DATABASES = {
    "default": dj_database_url.parse(
        database_url,
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=True,
    )
}
# Neon's free-tier compute autosuspends after ~5 minutes idle, well inside
# conn_max_age — CONN_HEALTH_CHECKS discards a dead pooled connection
# instead of reusing it and raising mid-request. connect_timeout keeps a
# truly unreachable database from blocking the worker until gunicorn kills
# it (which would surface as a 502, not the health endpoint's own 503).
DATABASES["default"].setdefault("OPTIONS", {})["connect_timeout"] = 10

allowed_hosts = os.environ.get("ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [h.strip() for h in allowed_hosts.split(",") if h.strip()]
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS is required in production.")

if not CORS_ALLOWED_ORIGINS:  # noqa: F405
    raise ImproperlyConfigured(
        "CORS_ALLOWED_ORIGINS is required in production."
    )
