from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
    }
}

if not CORS_ALLOWED_ORIGINS:  # noqa: F405
    CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]
