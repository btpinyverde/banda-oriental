"""The server's own player stats, recomputed from the attempts and scores it saved.

Recomputing (instead of adding one to a counter) means a stats row can never drift or be forged: it is always what
the saved games say. A day counts when the game is over (won, or the sixth attempt used). Streaks run over the days
that had a published song, so a day without a song neither breaks nor extends a streak; a published day the player
did not play (or lost) does break it. Today not being over yet does not break the streak.
"""

from django.db.models import Q, Sum
from django.utils import timezone

from .models import DailySong, GuessAttempt, PlayerStats, ScoreEntry, empty_distribution

MAX_ATTEMPTS = 6


def _owner_q(user, device_id):
    if user is not None:
        return Q(user=user)
    if device_id:
        return Q(device_id=device_id, user__isnull=True)
    raise ValueError("A user or a device_id is needed.")


def _streaks(published_days, won_days, played_days, today):
    """(current, best) over the published days, oldest to newest."""
    best = run = 0
    for day in published_days:
        run = run + 1 if day in won_days else 0
        best = max(best, run)

    days = [day for day in published_days if day <= today]
    # Today still open: start from the day before, so a streak survives until the day is over.
    if days and days[-1] == today and today not in played_days:
        days = days[:-1]
    current = 0
    for day in reversed(days):
        if day not in won_days:
            break
        current += 1
    return current, best


def recompute_stats(*, user=None, device_id=None, today=None) -> PlayerStats:
    today = today or timezone.localdate()
    owner = _owner_q(user, device_id)

    attempts_by_day: dict = {}
    for attempt in GuessAttempt.objects.filter(owner).select_related("daily_song").order_by("attempt_number"):
        attempts_by_day.setdefault(attempt.daily_song.date, []).append(attempt)

    published = DailySong.objects.filter(state=DailySong.PUBLISHED)
    published_days = sorted(published.values_list("date", flat=True))
    published_set = set(published_days)

    distribution = empty_distribution()
    won_days, played_days = set(), set()
    for day, tries in attempts_by_day.items():
        if day not in published_set:
            continue
        winning = next((a.attempt_number for a in tries if a.is_correct), None)
        if winning is None and len(tries) < MAX_ATTEMPTS:
            continue  # still in progress
        played_days.add(day)
        if winning is not None:
            won_days.add(day)
            distribution[winning - 1] += 1

    current, best = _streaks(published_days, won_days, played_days, today)
    total_score = ScoreEntry.objects.filter(owner).aggregate(total=Sum("score"))["total"] or 0

    values = {
        "played": len(played_days),
        "won": len(won_days),
        "current_streak": current,
        "max_streak": best,
        "total_score": total_score,
        "distribution": distribution,
        "last_played_day": max(played_days) if played_days else None,
    }
    row, _ = PlayerStats.objects.update_or_create(
        **({"user": user} if user is not None else {"user": None, "device_id": device_id}), defaults=values
    )
    return row


def owner_of(request, device_id: str) -> dict:
    """The keyword arguments that name a player: the account with a session, otherwise the device."""
    if request.user is not None and request.user.is_authenticated:
        return {"user": request.user}
    return {"device_id": device_id}


def serialize(row: PlayerStats | None) -> dict:
    """What a player (or a ranking) is allowed to see. A player with no row yet is all zeros."""
    if row is None:
        row = PlayerStats()
    won, distribution = row.won, row.distribution or empty_distribution()
    attempts = sum(count * (index + 1) for index, count in enumerate(distribution))
    return {
        "public_name": row.public_name,
        "played": row.played,
        "won": won,
        "win_percentage": round(won * 100 / row.played) if row.played else None,
        "current_streak": row.current_streak,
        "max_streak": row.max_streak,
        "total_score": row.total_score,
        "average_attempts": round(attempts / won, 1) if won else None,
        "distribution": distribution,
        "last_played_day": str(row.last_played_day) if row.last_played_day else None,
    }
