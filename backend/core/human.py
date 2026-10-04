import requests
from django.conf import settings
from django.core import signing
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from .clientip import client_ip

SALT = "human-pass"
SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


class HumanCheckRequired(PermissionDenied):
    default_detail = "Necesitamos comprobar que sos una persona."
    default_code = "human_check_required"


def required() -> bool:
    """The check is on only once a Cloudflare Turnstile secret is configured (so dev, tests and the time before
    setting it up keep working)."""
    return bool(settings.TURNSTILE_SECRET_KEY)


def verify_turnstile(token: str, ip: str) -> bool:
    try:
        answer = requests.post(
            SITEVERIFY, data={"secret": settings.TURNSTILE_SECRET_KEY, "response": token, "remoteip": ip}, timeout=5
        ).json()
    except Exception:
        return False
    return answer.get("success") is True


def issue_pass(request) -> str:
    """A signed, short-lived pass tied to the visitor's address: proof that a Turnstile challenge was solved, so the
    challenge doesn't have to run on every request."""
    return signing.dumps({"ip": client_ip(request)}, salt=SALT)


def pass_is_valid(request) -> bool:
    raw = request.headers.get("X-Human-Pass", "")
    try:
        data = signing.loads(raw, salt=SALT, max_age=settings.HUMAN_PASS_TTL_SECONDS)
    except signing.BadSignature:
        return False
    return data.get("ip") == client_ip(request)


class HasHumanPass(BasePermission):
    """For the endpoints a bot would use to play or to create accounts."""

    def has_permission(self, request, view):
        if required() and not pass_is_valid(request):
            raise HumanCheckRequired()
        return True
