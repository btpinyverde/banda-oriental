from django.db.models import Count, Q

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
