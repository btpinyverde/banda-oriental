import os

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

# Safe here (unlike in base.py/dev.py): Render's buildCommand always runs
# `collectstatic` before the app starts, so the manifest this storage needs
# always exists by the time a real request comes in.
#
# This mutates the dict `from .base import *` brought in, rather than
# reassigning STORAGES outright — reassigning would silently drop
# "default" and "stems" (confirmed empirically: Django does not merge a
# STORAGES setting with any previous value, so a bare `STORAGES = {...}`
# here left FileField's storage lookup unable to find "stems" at all).
STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
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

# Render terminates TLS and forwards plain HTTP to gunicorn with
# X-Forwarded-Proto: https. Without telling Django to trust that header,
# request.is_secure() is always False behind the proxy, which makes the
# admin's CSRF check reject every real browser's https:// Origin with a
# 403 — nobody can log in.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [f"https://{host}" for host in ALLOWED_HOSTS]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Without this, a missing R2 var doesn't fail until the first real stem
# upload — the S3 client raises `ValueError: Invalid endpoint: ''` deep
# inside storages/boto3 at that point, not at startup like every other
# required setting above.
for _r2_var in (
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ENDPOINT_URL",
):
    if not globals()[_r2_var]:
        raise ImproperlyConfigured(f"{_r2_var} is required in production.")

# Emails carry single-use links. Two ways to get that wrong in production, both refused at startup:
# - a backend that prints or stores the message (console, locmem, file) would leak every link into the logs;
# - links built on a non-https frontend URL (or the localhost default) would be broken or sniffable.
_LEAKY_EMAIL_BACKENDS = {
    "django.core.mail.backends.console.EmailBackend",
    "django.core.mail.backends.locmem.EmailBackend",
    "django.core.mail.backends.filebased.EmailBackend",
}
if EMAIL_BACKEND in _LEAKY_EMAIL_BACKENDS:  # noqa: F405
    raise ImproperlyConfigured(f"EMAIL_BACKEND {EMAIL_BACKEND} must not be used in production.")  # noqa: F405
if EMAIL_BACKEND != "django.core.mail.backends.dummy.EmailBackend" and not FRONTEND_URL.startswith("https://"):  # noqa: F405
    raise ImproperlyConfigured("FRONTEND_URL must be an https:// URL when emails are sent.")

EMAIL_SEND_IN_BACKGROUND = True

if EMAIL_BACKEND == "django.core.mail.backends.dummy.EmailBackend":
    import logging

    logging.getLogger(__name__).warning(
        "El correo está APAGADO: falta RESEND_API_KEY. Nadie va a poder confirmar su cuenta, restablecer la "
        "contraseña ni entrar con enlace hasta que se configure."
    )
