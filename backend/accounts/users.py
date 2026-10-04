from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import Profile

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
