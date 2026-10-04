"""Housekeeping for players nobody can claim any more."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .models import GuessAttempt, PlayerStats, ScoreEntry


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

    attempts = GuessAttempt.objects.filter(user__isnull=True, device_id__in=idle)
    scores = ScoreEntry.objects.filter(user__isnull=True, device_id__in=idle)
    stats = PlayerStats.objects.filter(user__isnull=True, device_id__in=idle)
    counts = {"devices": len(idle), "attempts": attempts.count(), "scores": scores.count(), "stats": stats.count()}
    if not dry_run:
        with transaction.atomic():
            attempts.delete()
            scores.delete()
            stats.delete()
    return counts
