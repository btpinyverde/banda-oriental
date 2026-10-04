import uuid

from django.db import IntegrityError, transaction

from gameplay.models import GuessAttempt, PlayerStats, ScoreEntry
from gameplay.stats import recompute_stats


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
            # One game and one score per person per day: the account's stands. The anonymous score for that same
            # day would show the person twice in the rankings, so it goes (the attempts stay until they expire).
            ScoreEntry.objects.filter(daily_song_id=day, **unowned).delete()
            continue
        try:
            with transaction.atomic():
                GuessAttempt.objects.filter(daily_song_id=day, **unowned).update(user=user)
                ScoreEntry.objects.filter(daily_song_id=day, **unowned).update(user=user)
        except IntegrityError:
            continue  # another request claimed it first
    adopt_device_stats(user, device_id)


def adopt_device_stats(user, device_id: str) -> None:
    """The stats follow the games: the account's row is recomputed with everything it now has (so a streak that
    started anonymously goes on), the public name chosen on the device moves to the account unless it already has
    one, and the device's own row goes away when nothing is left on the device."""
    device_row = PlayerStats.objects.filter(device_id=device_id, user__isnull=True).first()
    name = device_row.public_name if device_row else None
    with transaction.atomic():
        if device_row is not None and name:
            device_row.public_name = None  # releases the name before the account takes it
            device_row.save(update_fields=["public_name"])
        row = recompute_stats(user=user)
        if name and not row.public_name:
            row.public_name = name
            row.save(update_fields=["public_name"])
        if device_row is not None:
            leftovers = (
                GuessAttempt.objects.filter(device_id=device_id, user__isnull=True).exists()
                or ScoreEntry.objects.filter(device_id=device_id, user__isnull=True).exists()
            )
            if leftovers:
                recompute_stats(device_id=device_id)
            else:
                device_row.delete()
