import logging
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from .models import EmailChallenge

EMAILS_PER_ADDRESS_PER_HOUR = 5
LOGIN_FAILURES_ALLOWED = 10
LOGIN_LOCK_SECONDS = 15 * 60
logger = logging.getLogger(__name__)
TOO_MANY = {"detail": "Demasiados intentos. Probá de nuevo en unos minutos."}


def can_send_email(email: str, new_address: bool = False) -> bool:
    """False once an address got 5 emails in the last hour, or a daily cap was reached.

    There are two daily caps: one for the whole site and a smaller one for addresses with no confirmed account.
    Strangers can't tell which addresses have an account, so they can only use up the smaller pool; people who
    already have an account (reset, sign-in link) keep getting their emails.

    Counted from the EmailChallenge rows, so it survives restarts and doesn't depend on one process's memory.
    The caller still answers the same thing either way: the limit must not reveal anything.
    """
    now = timezone.now()
    day = EmailChallenge.objects.filter(created_at__gte=now - timedelta(hours=24))
    if EmailChallenge.objects.filter(email=email, created_at__gte=now - timedelta(hours=1)).count() >= EMAILS_PER_ADDRESS_PER_HOUR:
        return False
    if day.count() >= settings.EMAIL_DAILY_CAP:
        logger.warning("Se alcanzó el límite diario de correos del sitio (%s).", settings.EMAIL_DAILY_CAP)
        return False
    if new_address and day.filter(to_new_address=True).count() >= settings.EMAIL_NEW_ADDRESS_DAILY_CAP:
        logger.warning(
            "Se alcanzó el límite diario de correos a direcciones nuevas (%s).", settings.EMAIL_NEW_ADDRESS_DAILY_CAP
        )
        return False
    return True


# Login failures are counted per email only. Counting per IP would trust a header any client can forge behind the
# proxy, which would let an attacker skip the limit; the price is that someone can lock a victim out of password
# login for a few minutes (the sign-in link still works).
def _failures_key(email: str) -> str:
    return f"login-failures:{email}"


def login_locked(email: str) -> bool:
    return cache.get(_failures_key(email), 0) >= LOGIN_FAILURES_ALLOWED


def register_login_failure(email: str) -> None:
    key = _failures_key(email)
    cache.add(key, 0, timeout=LOGIN_LOCK_SECONDS)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=LOGIN_LOCK_SECONDS)


def clear_login_failures(email: str) -> None:
    cache.delete(_failures_key(email))
