"""Housekeeping for players nobody can claim any more."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .models import GuessAttempt, PlayerStats, ScoreEntry


def still_idle(devices: list, cutoff) -> list:
    """The devices from `devices` that really have no attempt or score newer than `cutoff`. Asked again inside the
    transaction that deletes, so someone who came back after the list was made is not deleted."""
    back = set(GuessAttempt.objects.filter(user__isnull=True, device_id__in=devices, created_at__gte=cutoff).values_list("device_id", flat=True))
    back |= set(ScoreEntry.objects.filter(user__isnull=True, device_id__in=devices, created_at__gte=cutoff).values_list("device_id", flat=True))
    return [device for device in devices if device not in back]


def purge_inactive_anonymous(*, days: int, now=None, dry_run: bool = False) -> dict:
    """Deletes the anonymous players (devices without an account) that have not played for `days` days: their
    attempts, scores and stats. An account's games are never touched, and neither is anything a device gave to an
    account. `days=0` switches it off. Returns what was (or, in a dry run, would be) deleted."""
    nothing = {"devices": 0, "attempts": 0, "scores": 0, "stats": 0}
    if days <= 0:
        return nothing
    cutoff = (now or timezone.now()) - timedelta(days=days)

    last_play: dict[str, object] = {}
    for model in (GuessAttempt, ScoreEntry):
        for row in model.objects.filter(user__isnull=True).values("device_id").annotate(last=Max("created_at")):
            last_play[row["device_id"]] = max(last_play.get(row["device_id"], row["last"]), row["last"])
    # A stats row with no games left is judged by when it was last touched.
    for row in PlayerStats.objects.filter(user__isnull=True).values("device_id").annotate(last=Max("updated_at")):
        last_play.setdefault(row["device_id"], row["last"])

    idle = [device for device, last in last_play.items() if last < cutoff]
    if not idle:
        return nothing

    def doomed(devices):
        return (
            GuessAttempt.objects.filter(user__isnull=True, device_id__in=devices),
            ScoreEntry.objects.filter(user__isnull=True, device_id__in=devices),
            PlayerStats.objects.filter(user__isnull=True, device_id__in=devices),
        )

    if dry_run:
        attempts, scores, stats = doomed(idle)
        return {"devices": len(idle), "attempts": attempts.count(), "scores": scores.count(), "stats": stats.count()}

    with transaction.atomic():
        idle = still_idle(idle, cutoff)
        if not idle:
            return nothing
        attempts, scores, stats = doomed(idle)
        counts = {"devices": len(idle), "attempts": attempts.count(), "scores": scores.count(), "stats": stats.count()}
        attempts.delete()
        scores.delete()
        stats.delete()
    return counts
