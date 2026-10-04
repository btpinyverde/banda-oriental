import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

TOKEN_UNUSED_LIFETIME = timedelta(days=90)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class AuthToken(models.Model):
    """A login session. Only the hash is stored; the raw token is shown once, at creation."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="auth_tokens")
    key_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(default=timezone.now)

    @classmethod
    def issue(cls, user) -> str:
        raw = new_token()
        cls.objects.create(user=user, key_hash=hash_token(raw))
        return raw

    def is_expired(self) -> bool:
        return timezone.now() - self.last_used_at > TOKEN_UNUSED_LIFETIME


class EmailChallenge(models.Model):
    """A single-use emailed link (confirm the address, sign in, reset the password)."""

    CONFIRM = "confirm"
    MAGIC = "magic"
    RESET = "reset"
    # Not a link: a record that an informational email ("you already have an account") was sent, so it counts
    # against the sending limits like the rest. It can never be consumed.
    NOTICE = "notice"
    PURPOSES = [(CONFIRM, "confirm"), (MAGIC, "magic"), (RESET, "reset"), (NOTICE, "notice")]
    LIFETIMES = {
        CONFIRM: timedelta(hours=24),
        MAGIC: timedelta(minutes=15),
        RESET: timedelta(minutes=15),
        NOTICE: timedelta(minutes=15),
    }

    email = models.EmailField()
    purpose = models.CharField(max_length=10, choices=PURPOSES)
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    # Hash of the password chosen when this link was requested (confirm links only). Confirming applies it, so the
    # password always belongs to the person who actually received and used the link.
    password_hash = models.CharField(max_length=128, blank=True, default="")
    # Sent to an address with no confirmed account. Those emails share a smaller daily pool, so strangers can't use
    # up the whole mail quota and leave people who already have an account without their emails.
    to_new_address = models.BooleanField(default=False)
    # Whether the person ticked "I want news by email" when they asked for this link. It is applied to their profile
    # when the account is created or confirmed with it, not before.
    accepts_news = models.BooleanField(default=False)

    @classmethod
    def issue(
        cls, email: str, purpose: str, password_hash: str = "", new_address: bool = False, accepts_news: bool = False
    ) -> str:
        raw = new_token()
        cls.objects.create(
            email=email,
            purpose=purpose,
            password_hash=password_hash,
            to_new_address=new_address,
            accepts_news=accepts_news,
            token_hash=hash_token(raw),
            expires_at=timezone.now() + cls.LIFETIMES[purpose],
        )
        return raw

    @classmethod
    def peek(cls, raw: str, purpose: str):
        """The link, without using it up (None if it is unknown, used, expired or for another purpose)."""
        return cls.objects.filter(
            token_hash=hash_token(raw), purpose=purpose, used_at__isnull=True, expires_at__gt=timezone.now()
        ).first()

    @classmethod
    def cancel_pending(cls, email: str, purposes) -> None:
        """Uses up every link of these kinds still pending for the address."""
        cls.objects.filter(email=email, purpose__in=purposes, used_at__isnull=True).update(used_at=timezone.now())

    @classmethod
    def consume(cls, raw: str, purpose: str):
        """Marks the link as used and returns it, or None if it is unknown, used, expired or for another purpose.

        The check and the mark happen in one UPDATE, so two simultaneous requests can't both consume it.
        """
        now = timezone.now()
        token_hash = hash_token(raw)
        updated = cls.objects.filter(
            token_hash=token_hash, purpose=purpose, used_at__isnull=True, expires_at__gt=now
        ).update(used_at=now)
        if updated == 0:
            return None
        return cls.objects.get(token_hash=token_hash)


class Profile(models.Model):
    """What the API knows about an account beyond Django's user.

    `User.is_active` is the admin's on/off switch (a blocked account stays blocked whatever email links arrive).
    Whether the owner proved they read the mailbox is a separate fact, kept here.
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    email_confirmed_at = models.DateTimeField(null=True, blank=True)
    # What the person accepted when the account was created: the Terms and the Privacy policy (which version of the
    # texts) and, separately and off by default, whether they want news by email (and when they chose it).
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    terms_version = models.CharField(max_length=20, blank=True, default="")
    news_opt_in = models.BooleanField(default=False)
    news_opt_in_at = models.DateTimeField(null=True, blank=True)
