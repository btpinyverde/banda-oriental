import os

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise ImproperlyConfigured(
        "DATABASE_URL is required in production and was not set."
    )

DATABASES = {
    "default": dj_database_url.parse(database_url, conn_max_age=600, ssl_require=True)
}

allowed_hosts = os.environ.get("ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [h.strip() for h in allowed_hosts.split(",") if h.strip()]
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS is required in production.")

if not CORS_ALLOWED_ORIGINS:  # noqa: F405
    raise ImproperlyConfigured(
        "CORS_ALLOWED_ORIGINS is required in production."
    )
