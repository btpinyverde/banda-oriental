import os
from pathlib import Path

from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "storages",
    "core",
    "accounts",
    "anymail",
    "catalog",
    "gameplay",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "core.middleware.BlockAiAgentsMiddleware",
    "core.middleware.DailyMaintenanceMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

LANGUAGE_CODE = "es-uy"
TIME_ZONE = "America/Montevideo"
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Django does NOT merge a custom STORAGES dict with its own defaults —
# defining STORAGES at all means naming every key yourself, including ones
# you don't want to change (confirmed empirically: omitting "default" here
# left it missing from settings.STORAGES entirely). "staticfiles" stays
# Django's plain default here on purpose: whitenoise's manifest storage
# needs `collectstatic` to have run first (only true in prod's build
# step); using it in dev/test too would break every `{% static %}` tag,
# since there's no manifest.json locally. "stems" points at Cloudflare R2
# (private bucket — every URL must be signed, never a bare public link).
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "")
R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL", "")

STORAGES["stems"] = {
    "BACKEND": "storages.backends.s3.S3Storage",
    "OPTIONS": {
        "access_key": R2_ACCESS_KEY_ID,
        "secret_key": R2_SECRET_ACCESS_KEY,
        "bucket_name": R2_BUCKET_NAME,
        "endpoint_url": R2_ENDPOINT_URL,
        "region_name": "auto",
        "querystring_auth": True,
        "default_acl": None,
        "signature_version": "s3v4",
        "querystring_expire": 3600,
        # Defense in depth alongside stem_upload_path's random filenames
        # (gameplay/models.py): without this, a name collision would
        # silently replace an existing object instead of erroring.
        "file_overwrite": False,
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# No login for *players* in this project (see spec): DRF's default
# authentication classes touch django.contrib.auth.models on request.user,
# which would otherwise import AnonymousUser. The admin (staff-only,
# session-based) is unaffected by this — it's a separate auth path DRF
# doesn't touch.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    # Without this, a browser's Accept header (which includes text/html)
    # makes DRF pick BrowsableAPIRenderer, which needs a template we don't
    # configure and crashes with a 500. This API is JSON-only, always.
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    # Every request counts against its visitor's address; views with a `throttle_scope` get a stricter rate too.
    # The counts live in the cache (one process's memory today: with more workers the real limit is per worker).
    "DEFAULT_THROTTLE_CLASSES": ["core.throttling.IpThrottle", "core.throttling.ScopedIpThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "global": "240/min",
        "auth": "30/hour",  # login and the endpoints that use an emailed link
        "send-email": "12/hour",  # register and the requests for an emailed link
        "guess": "60/min",
        "score": "10/hour",
        "name": "10/hour",
        "songs": "30/min",
        "human": "30/hour",
    },
    "EXCEPTION_HANDLER": "core.throttling.exception_handler",
}

# The frontend identifies each player with a custom X-Device-Id header. django-cors-headers only allows a fixed
# list of headers by default, so without this the browser's preflight fails and every game call is blocked.
CORS_ALLOW_HEADERS = (*default_headers, "x-device-id", "x-human-pass")

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

# Scoring constants live here (spec §8), never hardcoded in a view or in
# the frontend, so they can be tuned without a frontend deploy.
GAMEPLAY_BASE_SCORES = {1: 100, 2: 85, 3: 70, 4: 55, 5: 40, 6: 20}
GAMEPLAY_SPEED_BONUS = {
    "max": 50,
    # Below this, a guess counts as "instant" and gets the full bonus —
    # protects against a near-zero elapsed time looking infinitely good.
    "min_elapsed_seconds": 1,
    # At or beyond this, the bonus floors at zero — protects against a
    # huge or negative elapsed time (clock skew, a tab left open) ever
    # producing an absurd or negative score (spec §8).
    "max_elapsed_seconds": 60,
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Base URL of the frontend, used to build the links in emails.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Banda Oriental <no-reply@xami.uy>")
# There is no email provider yet. The dummy backend sends and logs nothing, so confirmation links never end up
# in production logs. Development overrides it with the console backend.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.dummy.EmailBackend")
# Real sending goes through Resend's HTTP API (Render's free plan blocks outbound SMTP). Setting the key is all
# it takes to turn email on; an explicit EMAIL_BACKEND still wins.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
if RESEND_API_KEY and "EMAIL_BACKEND" not in os.environ:
    EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"
ANYMAIL = {"RESEND_API_KEY": RESEND_API_KEY}

# Daily cap on emails sent by the whole site (the free mail plans have a daily quota; this stops a flood of
# requests from using it all up). Over the cap the API answers the same and just doesn't send.
EMAIL_DAILY_CAP = int(os.environ.get("EMAIL_DAILY_CAP", "90"))
# Smaller daily pool for emails to addresses that have no confirmed account (see accounts/limits.py).
EMAIL_NEW_ADDRESS_DAILY_CAP = int(os.environ.get("EMAIL_NEW_ADDRESS_DAILY_CAP", "50"))
# Send emails after answering the request, so every branch answers equally fast. On in production (prod.py).
EMAIL_SEND_IN_BACKGROUND = False

# Behind Render the connection address is the proxy's; Cloudflare (its edge) sets the real one in CF-Connecting-IP.
# Off by default: elsewhere that header is one more thing a client can forge. See core/clientip.py.
TRUST_CLOUDFLARE_IP_HEADER = os.environ.get("TRUST_CLOUDFLARE_IP_HEADER", "") == "1"

# Cloudflare Turnstile: with a secret, the game and the account forms ask for a human-check pass (core/human.py).
TURNSTILE_SECRET_KEY = os.environ.get("TURNSTILE_SECRET_KEY", "")
HUMAN_PASS_TTL_SECONDS = 30 * 60

# The API only reads small JSON bodies; refuse anything bigger instead of reading it. File uploads (the admin's audio
# stems) don't count here.
DATA_UPLOAD_MAX_MEMORY_SIZE = 256 * 1024

# Anonymous players (no account) who have not played for this many days are deleted, once a day. 0 = off.
PURGE_ANONYMOUS_AFTER_DAYS = 0
PURGE_IN_BACKGROUND = True

# A player can change their public name once every this many days (0 = no wait).
PUBLIC_NAME_CHANGE_COOLDOWN_DAYS = 7

# Version of the Terms and the Privacy policy people accept when they create an account. Change it when the texts change
# in a way people should accept again; each acceptance records the version it was for.
TERMS_VERSION = "2026-10"
