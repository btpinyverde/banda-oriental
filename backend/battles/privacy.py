from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from .models import Battle, BattlePlayer


def erase_user(user):
    """Takes an account out of the battles before it is deleted, so no name or identity of it is left behind.

    - Its players keep their place (and their answers and points, so the ranking of the others does not change) but lose the
      name and the device: they become "Jugador eliminado N" (the number keeps the names of two erased players apart).
    - The rooms it organized stay for the people who played them, with no owner; one nobody ever joined is deleted.
    """
    for player in BattlePlayer.objects.filter(user=user):
        player.display_name = f"Jugador eliminado {player.pk}"
        player.device_id = ""
        player.user = None
        player.save(update_fields=["display_name", "device_id", "user"])
    hosted = Battle.objects.filter(host_user=user).annotate(people=Count("players", filter=~Q(players__status=BattlePlayer.REJECTED)))
    hosted.filter(people=0).delete()
    Battle.objects.filter(host_user=user).update(host_user=None, host_device_id="")


def purge_anonymous_battles(*, days, now=None, dry_run=False):
    """The anonymous side of the battles, after `days` days (the same rule as the daily game's anonymous data).

    A player with no account that joined that long ago loses the name and the device but keeps his place, answers and points, so the
    ranking of the others does not change. A room organized from a device (no account) loses the device; one nobody ever joined is
    deleted. Accounts are never touched. `days=0` switches it off. Returns how many players and rooms were (or would be) changed.
    """
    if days <= 0:
        return {"players": 0, "rooms": 0}
    cutoff = (now or timezone.now()) - timedelta(days=days)
    players = BattlePlayer.objects.filter(user__isnull=True, joined_at__lt=cutoff).exclude(device_id="")
    # "Anonymous organizer": a room with no owner account that still remembers a device. Empty ones are deleted instead.
    rooms = Battle.objects.filter(host_user__isnull=True, created_at__lt=cutoff).exclude(host_device_id="")
    empty = Battle.objects.filter(host_user__isnull=True, created_at__lt=cutoff).annotate(people=Count("players")).filter(people=0)
    counts = {"players": players.count(), "rooms": rooms.count()}
    if dry_run:
        return counts
    with transaction.atomic():
        for player in players:
            player.display_name = f"Jugador anónimo {player.pk}"
            player.device_id = ""
            player.save(update_fields=["display_name", "device_id"])
        empty.delete()
        rooms.update(host_device_id="")
    return counts
