from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

# A missing SECRET_KEY doesn't just weaken dev security — Django's own
# debug error pages fail with ImproperlyConfigured before showing the real
# error, which hides whatever actually broke.
SECRET_KEY = SECRET_KEY or "dev-insecure-key"  # noqa: F405

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
    }
}

if not CORS_ALLOWED_ORIGINS:  # noqa: F405
    # Next.js dev server (frontend/), not Vite — the frontend moved off
    # Vite mid-plan (see spec §9).
    CORS_ALLOWED_ORIGINS = ["http://localhost:3000"]
