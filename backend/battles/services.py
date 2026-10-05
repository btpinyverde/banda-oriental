import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Song
from gameplay.moderation import contains_banned_word

from .identity import is_host, player_for
from .models import Battle, BattlePlayer, BattleRound
from .previews import preview_url
from .timeline import build_schedule

NAME_TAKEN = "Ese nombre ya está en la sala. Elegí otro."
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


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


def _clean_name(name):
    if not isinstance(name, str):
        raise ValidationError({"display_name": "Tiene que ser texto."})
    name = name.strip()
    if not name or len(name) > 50 or _CONTROL.search(name) or contains_banned_word(name):
        raise ValidationError({"display_name": "Nombre inválido."})
    return name


def join_battle(battle, caller, display_name, host_token=""):
    """Adds the caller to the battle in its lobby. Returns (player, created)."""
    existing = player_for(battle, caller)
    if existing is not None:
        return existing, False
    if is_host(battle, caller, host_token):
        raise ValidationError({"detail": "Quien organiza la batalla no juega."})
    name = _clean_name(display_name)
    if battle.players.count() >= settings.BATTLES["MAX_PLAYERS"]:
        raise ValidationError({"detail": "La sala está llena."})
    try:
        with transaction.atomic():
            player = BattlePlayer.objects.create(
                battle=battle, user=caller.user, device_id=caller.device_id if caller.user is None else "", display_name=name
            )
    except IntegrityError:
        raise ValidationError({"display_name": NAME_TAKEN})
    Battle.objects.filter(pk=battle.pk).update(version=F("version") + 1)
    return player, True


def _pick_songs(count):
    """`count` distinct songs that have a Deezer preview, at random; hidden ones (duplicates, classical) never play."""
    ids = list(Song.objects.filter(hidden=False, deezer_id__isnull=False).order_by("?").values_list("pk", flat=True)[: count * 6])
    chosen = []
    for song in Song.objects.filter(pk__in=ids).order_by("?").select_related("album__artist")[: count * 3]:
        if preview_url(song):
            chosen.append(song)
        if len(chosen) == count:
            return chosen
    raise ValidationError({"detail": "No pudimos armar las canciones. Probá de nuevo."})


def start_battle(battle, now=None):
    now = now or timezone.now()
    if battle.players.count() < 2:
        raise ValidationError({"detail": "Hace falta al menos otra persona para jugar."})
    songs = _pick_songs(battle.round_count)
    cfg = settings.BATTLES
    schedule = build_schedule(now, battle.round_count, battle.round_seconds, cfg["COUNTDOWN_SECONDS"], cfg["REVEAL_SECONDS"])
    with transaction.atomic():
        # Only one request wins the move out of the lobby; any other finds it already started.
        moved = Battle.objects.filter(pk=battle.pk, status=Battle.LOBBY).update(status=Battle.PLAYING, started_at=now, version=F("version") + 1)
        if not moved:
            raise ValidationError({"detail": "La batalla ya empezó."})
        BattleRound.objects.bulk_create(
            [BattleRound(battle=battle, index=i, song=song, starts_at=a, ends_at=b) for i, (song, (a, b)) in enumerate(zip(songs, schedule))]
        )
