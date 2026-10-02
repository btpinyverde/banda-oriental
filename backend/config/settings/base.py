import os
from pathlib import Path

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
    "core",
    "catalog",
    "gameplay",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
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
# since there's no manifest.json locally. "stems" is a temporary local
# stub — Task 2 replaces it with the real Cloudflare R2 backend.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    "stems": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
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
}

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
