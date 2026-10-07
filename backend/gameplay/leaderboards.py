"""Rankings by period, built from the scores the server saved.

Everyone is in: an account counts once whatever the devices it used, and a device that has no account counts as a
player of its own. Names are looked up only for the rows that are shown.
"""

import calendar
from datetime import date, timedelta

from django.db.models import Count, Q, Sum

from .models import PlayerStats, ScoreEntry

PERIODS = ("day", "week", "month", "all")


def period_range(period: str, today: date) -> tuple[date | None, date | None]:
    if period == "day":
        return today, today
    if period == "week":
        monday = today - timedelta(days=today.weekday())
        return monday, monday + timedelta(days=6)
    if period == "month":
        return today.replace(day=1), today.replace(day=calendar.monthrange(today.year, today.month)[1])
    return None, None


def _totals(start, end) -> list[dict]:
    scores = ScoreEntry.objects.all()
    if start is not None:
        scores = scores.filter(daily_song__date__range=(start, end))
    players = []
    for row in scores.filter(user__isnull=False).values("user_id").annotate(total=Sum("score"), games=Count("id")):
        players.append({"key": ("u", row["user_id"]), "score": row["total"], "games": row["games"]})
    for row in scores.filter(user__isnull=True).values("device_id").annotate(total=Sum("score"), games=Count("id")):
        players.append({"key": ("d", row["device_id"]), "score": row["total"], "games": row["games"]})
    # Best score first; with the same score, fewer games first; then a stable order.
    players.sort(key=lambda p: (-p["score"], p["games"], str(p["key"][1])))
    previous_score, previous_rank = None, 0
    for position, player in enumerate(players, start=1):
        player["rank"] = previous_rank if player["score"] == previous_score else position
        previous_score, previous_rank = player["score"], player["rank"]
    return players


def _names(players: list[dict]) -> dict:
    """The public name each shown player has now; for a player without one, the name of their latest score."""
    user_ids = [p["key"][1] for p in players if p["key"][0] == "u"]
    device_ids = [p["key"][1] for p in players if p["key"][0] == "d"]
    names = {}
    for row in PlayerStats.objects.filter(user_id__in=user_ids, public_name__isnull=False):
        names[("u", row.user_id)] = row.public_name
    for row in PlayerStats.objects.filter(device_id__in=device_ids, user__isnull=True, public_name__isnull=False):
        names[("d", row.device_id)] = row.public_name
    missing = {p["key"] for p in players} - set(names)
    if missing:
        missing_users = [value for kind, value in missing if kind == "u"]
        missing_devices = [value for kind, value in missing if kind == "d"]
        latest = ScoreEntry.objects.filter(
            Q(user_id__in=missing_users) | Q(device_id__in=missing_devices, user__isnull=True)
        ).order_by("created_at")
        for user_id, device_id, display_name in latest.values_list("user_id", "device_id", "display_name"):
            key = ("u", user_id) if user_id is not None else ("d", device_id)
            if key in missing:
                names[key] = display_name  # oldest first, so the latest score's name is the one that stays
        for key in missing:
            names.setdefault(key, "")
    return names


def _stats(players: list[dict]) -> dict:
    """What the server knows of each shown player besides the score: current streak, how many games finished and the accuracy
    (percentage won). A player with no stats row yet gets zeros and no accuracy."""
    user_ids = [p["key"][1] for p in players if p["key"][0] == "u"]
    device_ids = [p["key"][1] for p in players if p["key"][0] == "d"]
    found = {}
    for row in PlayerStats.objects.filter(user_id__in=user_ids):
        found[("u", row.user_id)] = row
    for row in PlayerStats.objects.filter(device_id__in=device_ids, user__isnull=True):
        found[("d", row.device_id)] = row
    return found


def build(period: str, today: date, *, limit: int, page: int = 1, me_key=None) -> dict:
    """One page of the ranking: `limit` rows starting at row `(page - 1) * limit`. The ranks keep counting across pages."""
    start, end = period_range(period, today)
    players = _totals(start, end)
    first = (page - 1) * limit
    shown = players[first : first + limit]
    me = next((p for p in players if p["key"] == me_key), None) if me_key else None
    visible = shown + ([me] if me and me not in shown else [])
    names = _names(visible)
    stats = _stats(visible)

    def public(player):
        row = stats.get(player["key"])
        return {
            "rank": player["rank"],
            "display_name": names[player["key"]],
            "score": player["score"],
            "games": player["games"],
            "current_streak": row.current_streak if row else 0,
            "win_percentage": round(row.won * 100 / row.played) if row and row.played else None,
            # Games finished in all, or (without stats yet) the scores it has.
            "played": row.played if row and row.played else player["games"],
        }

    return {
        "period": period,
        "from": str(start) if start else None,
        "to": str(end) if end else None,
        "entries": [public(p) for p in shown],
        "page": page,
        "has_more": first + limit < len(players),
        # How many players the ranking has in all, not only the ones shown: "you are 3rd of 128".
        "players": len(players),
        "me": public(me) if me else None,
    }
