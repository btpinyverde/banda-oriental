from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.utils import timezone

from .models import EmailChallenge, Profile

User = get_user_model()


def find_user(email: str):
    return User.objects.filter(username=email).first()


def is_confirmed(user) -> bool:
    return Profile.objects.filter(user=user, email_confirmed_at__isnull=False).exists()


def mark_confirmed(user) -> None:
    """Records that the owner read the mailbox. Keeps the first confirmation date if there already is one."""
    profile, _ = Profile.objects.get_or_create(user=user)
    if profile.email_confirmed_at is None:
        profile.email_confirmed_at = timezone.now()
        profile.save(update_fields=["email_confirmed_at"])


def matches_pending_password(email: str, password: str) -> bool:
    """True if `password` is the one chosen with a confirmation link that is still pending for this address.

    An unconfirmed account has no usable password of its own (whoever registered first must not keep one), so the
    only way to tell "right password, but you still have to confirm" is to look at the pending links.
    """
    pending = EmailChallenge.objects.filter(
        email=email, purpose=EmailChallenge.CONFIRM, used_at__isnull=True, expires_at__gt=timezone.now()
    )
    return any(link.password_hash and check_password(password, link.password_hash) for link in pending)
