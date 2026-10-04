import uuid

from django.db import IntegrityError, transaction

from gameplay.models import GuessAttempt, ScoreEntry


def device_id_from(request) -> str | None:
    """The X-Device-Id header if it is a valid UUID, otherwise None (here it is optional, unlike in the game)."""
    try:
        return str(uuid.UUID(request.headers.get("X-Device-Id", "").strip()))
    except ValueError:
        return None


def claim_device_games(user, device_id: str | None) -> None:
    """Moves the games played anonymously on this device to the account, one day at a time.

    Only rows nobody owns are taken. If the account already played that day, the account wins and the device's game
    for that day stays as it was: one game per day per account, and nothing already saved gets overwritten.
    """
    if device_id is None:
        return
    unowned = {"device_id": device_id, "user__isnull": True}
    days = set(GuessAttempt.objects.filter(**unowned).values_list("daily_song_id", flat=True))
    days |= set(ScoreEntry.objects.filter(**unowned).values_list("daily_song_id", flat=True))
    for day in days:
        already_played = (
            GuessAttempt.objects.filter(user=user, daily_song_id=day).exists()
            or ScoreEntry.objects.filter(user=user, daily_song_id=day).exists()
        )
        if already_played:
            continue
        try:
            with transaction.atomic():
                GuessAttempt.objects.filter(daily_song_id=day, **unowned).update(user=user)
                ScoreEntry.objects.filter(daily_song_id=day, **unowned).update(user=user)
        except IntegrityError:
            continue  # another request claimed it first
