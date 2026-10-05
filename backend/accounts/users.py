from django.contrib.auth import get_user_model
from django.conf import settings
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


def record_consent(user, accepts_news: bool) -> None:
    """Records what the person accepted when their account is created (the Terms and the Privacy policy, with the
    version of the texts) and, if they ticked it, that they want news by email. Only the first time: an account that
    already accepted keeps what it chose, whatever a later link says."""
    profile, _ = Profile.objects.get_or_create(user=user)
    now = timezone.now()
    changed = []
    if profile.terms_accepted_at is None:
        profile.terms_accepted_at, profile.terms_version = now, settings.TERMS_VERSION
        changed += ["terms_accepted_at", "terms_version"]
        if accepts_news:
            profile.news_opt_in, profile.news_opt_in_at = True, now
            changed += ["news_opt_in", "news_opt_in_at"]
        profile.save(update_fields=changed)


def set_news_opt_in(user, value: bool) -> Profile:
    """The person changes their mind about news by email: the choice and the moment they made it."""
    profile, _ = Profile.objects.get_or_create(user=user)
    if profile.news_opt_in != value:
        profile.news_opt_in, profile.news_opt_in_at = value, timezone.now()
        profile.save(update_fields=["news_opt_in", "news_opt_in_at"])
    return profile


def apply_public_name(user, name: str) -> None:
    """The username chosen when registering becomes the public name of the rankings. Never replaces a name the account already
    has, and if somebody took it since (the check at registration was a while ago) the account just has no name yet: it is
    chosen when saving the first score, as always."""
    from django.db import IntegrityError, transaction

    from gameplay.models import PlayerStats

    name = (name or "").strip()
    if not name:
        return
    try:
        with transaction.atomic():
            row, _ = PlayerStats.objects.get_or_create(user=user)
            if not row.public_name:
                row.public_name = name
                row.save(update_fields=["public_name"])
    except IntegrityError:
        pass
