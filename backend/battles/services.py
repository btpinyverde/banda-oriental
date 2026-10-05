from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from gameplay.moderation import contains_banned_word

from .models import Battle


def _int_in_range(value, default, low, high, field):
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError({field: "Tiene que ser un número."})
    if not low <= value <= high:
        raise ValidationError({field: f"Tiene que estar entre {low} y {high}."})
    return value


def create_battle(caller, round_count=None, round_seconds=None, title=None):
    cfg = settings.BATTLES
    round_count = _int_in_range(round_count, 10, cfg["MIN_ROUNDS"], cfg["MAX_ROUNDS"], "round_count")
    round_seconds = _int_in_range(round_seconds, 20, cfg["MIN_ROUND_SECONDS"], cfg["MAX_ROUND_SECONDS"], "round_seconds")
    if title is None:
        title = ""
    if not isinstance(title, str):
        raise ValidationError({"title": "Tiene que ser texto."})
    title = title.strip()
    if len(title) > 60 or contains_banned_word(title):
        raise ValidationError({"title": "Título inválido."})
    for _ in range(5):  # a code collision is possible, if rare: try again with another
        try:
            with transaction.atomic():
                return Battle.objects.create(
                    host_user=caller.user,
                    host_device_id=caller.device_id if caller.user is None else "",
                    round_count=round_count,
                    round_seconds=round_seconds,
                    title=title,
                )
        except IntegrityError:
            continue
    raise ValidationError({"detail": "No pudimos crear la sala. Probá de nuevo."})
