import random
import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Song
from gameplay.moderation import contains_banned_word

from .access import min_players
from .filters import clean_filters, pool
from .playlist import clean_playlist
from .identity import is_host, player_for
from .models import Battle, BattleAnswer, BattlePlayer, BattleRound, BattleTeam
from .previews import preview_url
from .timeline import build_schedule, phase_at

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


def _choice(value, allowed, default, field):
    if value is None:
        return default
    if not isinstance(value, str) or value not in allowed:
        raise ValidationError({field: "Valor no válido."})
    return value


TEAM_COLORS = ["#6c4ff0", "#f08a4f", "#2fb67c", "#e8508a", "#f2c230", "#3aa0e8"]
MIN_TEAMS, MAX_TEAMS = 2, 6


def _clean_teams(team_mode, team_count, team_names):
    """(mode, names): the teams' names (defaults filled in) or an empty list when there are no teams."""
    mode = _choice(team_mode, (Battle.NO_TEAMS, Battle.RANDOM_TEAMS, Battle.MANUAL_TEAMS), Battle.NO_TEAMS, "team_mode")
    if mode == Battle.NO_TEAMS:
        return mode, []
    if isinstance(team_count, bool) or not isinstance(team_count, int) or not MIN_TEAMS <= team_count <= MAX_TEAMS:
        raise ValidationError({"team_count": f"Los equipos tienen que ser entre {MIN_TEAMS} y {MAX_TEAMS}."})
    given = [] if team_names is None else team_names
    if not isinstance(given, list) or len(given) > team_count:
        raise ValidationError({"team_names": "Los nombres tienen que ser una lista, uno por equipo como máximo."})
    names = []
    for i in range(team_count):
        raw = given[i] if i < len(given) else ""
        if not isinstance(raw, str):
            raise ValidationError({"team_names": "Cada nombre tiene que ser texto."})
        name = raw.strip() or f"Equipo {i + 1}"
        if len(name) > 50 or contains_banned_word(name):
            raise ValidationError({"team_names": "Nombre de equipo inválido."})
        names.append(name)
    if len({n.lower() for n in names}) != len(names):
        raise ValidationError({"team_names": "Los equipos no pueden llamarse igual."})
    return mode, names


def create_battle(caller, round_count=None, round_seconds=None, title=None, audio_mode=None, join_mode=None, songs_mode=None, filters=None, playlist=None, team_mode=None, team_count=None, team_names=None):
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
    songs_mode = _choice(songs_mode, (Battle.RANDOM, Battle.LIST), Battle.RANDOM, "songs_mode")
    filters = clean_filters(filters)
    items = []
    if songs_mode == Battle.LIST:
        items = clean_playlist(playlist)
        round_count = len(items)  # the list decides how many rounds there are
    team_mode, team_labels = _clean_teams(team_mode, team_count, team_names)
    audio_mode = _choice(audio_mode, (Battle.EACH, Battle.HOST), Battle.EACH, "audio_mode")
    join_mode = _choice(join_mode, (Battle.OPEN, Battle.APPROVAL), Battle.OPEN, "join_mode")
    for _ in range(5):  # a code collision is possible, if rare: try again with another
        try:
            with transaction.atomic():
                battle = Battle.objects.create(
                    host_user=caller.user,
                    host_device_id=caller.device_id if caller.user is None else "",
                    round_count=round_count,
                    round_seconds=round_seconds,
                    title=title,
                    audio_mode=audio_mode,
                    join_mode=join_mode,
                    songs_mode=songs_mode,
                    filters=filters,
                    playlist=items,
                    team_mode=team_mode,
                )
                BattleTeam.objects.bulk_create(
                    [BattleTeam(battle=battle, index=i, name=name, color=TEAM_COLORS[i]) for i, name in enumerate(team_labels)]
                )
                return battle
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
    if battle.players.exclude(status=BattlePlayer.REJECTED).count() >= settings.BATTLES["MAX_PLAYERS"]:
        raise ValidationError({"detail": "La sala está llena."})
    try:
        with transaction.atomic():
            player = BattlePlayer.objects.create(
                battle=battle,
                user=caller.user,
                device_id=caller.device_id if caller.user is None else "",
                display_name=name,
                status=BattlePlayer.PENDING if battle.join_mode == Battle.APPROVAL else BattlePlayer.ACCEPTED,
            )
    except IntegrityError:
        raise ValidationError({"display_name": NAME_TAKEN})
    Battle.objects.filter(pk=battle.pk).update(version=F("version") + 1)
    return player, True


def _pick_songs(count, filters):
    """`count` distinct songs inside the segment that have a Deezer preview, at random (hidden ones never play)."""
    songs = pool(filters)
    if songs.count() < count:
        raise ValidationError({"detail": "No hay suficientes canciones que cumplan los filtros. Ampliá la selección o pedí menos canciones."})
    ids = list(songs.order_by("?").values_list("pk", flat=True)[: count * 6])
    chosen = []
    for song in Song.objects.filter(pk__in=ids).order_by("?").select_related("album__artist")[: count * 3]:
        if preview_url(song):
            chosen.append({"song": song, "source": "deezer", "youtube_id": "", "start_seconds": 0})
        if len(chosen) == count:
            return chosen
    raise ValidationError({"detail": "No pudimos armar las canciones. Probá de nuevo."})


def _list_songs(items):
    """The organizer's list, in his order. A Deezer item needs its preview; a YouTube one does not (Deezer is only its fallback)."""
    songs = Song.objects.select_related("album__artist").in_bulk([item["song_id"] for item in items])
    chosen = []
    for item in items:
        song = songs[item["song_id"]]
        if item["source"] == "deezer" and not preview_url(song):
            raise ValidationError({"detail": f"No encontramos el audio de «{song.title}». Cambiá esa canción o usá un enlace de YouTube."})
        chosen.append({"song": song, "source": item["source"], "youtube_id": item["youtube_id"], "start_seconds": item["start_seconds"]})
    return chosen


def start_battle(battle, now=None):
    now = now or timezone.now()
    accepted = battle.players.filter(status=BattlePlayer.ACCEPTED).count()
    if accepted < min_players():
        raise ValidationError({"detail": "Hace falta al menos otra persona para jugar." if min_players() > 1 else "Hace falta que entre alguien para jugar."})
    songs = _list_songs(battle.playlist) if battle.songs_mode == Battle.LIST else _pick_songs(battle.round_count, battle.filters or clean_filters(None))
    cfg = settings.BATTLES
    schedule = build_schedule(now, battle.round_count, battle.round_seconds, cfg["COUNTDOWN_SECONDS"], cfg["REVEAL_SECONDS"])
    with transaction.atomic():
        # Only one request wins the move out of the lobby; any other finds it already started.
        moved = Battle.objects.filter(pk=battle.pk, status=Battle.LOBBY).update(status=Battle.PLAYING, started_at=now, version=F("version") + 1)
        if not moved:
            raise ValidationError({"detail": "La batalla ya empezó."})
        # Whoever is still waiting when it starts does not get in.
        battle.players.filter(status=BattlePlayer.PENDING).update(status=BattlePlayer.REJECTED)
        _assign_teams(battle)
        BattleRound.objects.bulk_create(
            [
                BattleRound(
                    battle=battle,
                    index=i,
                    song=pick["song"],
                    starts_at=a,
                    ends_at=b,
                    source=pick["source"],
                    youtube_id=pick["youtube_id"],
                    start_seconds=pick["start_seconds"],
                )
                for i, (pick, (a, b)) in enumerate(zip(songs, schedule))
            ]
        )
    battle.refresh_from_db(fields=["status", "started_at", "version"])


def submit_answer(battle, player, song_id, now):
    """Records the player's answer for the open round, timed by the server's clock. The first answer stands."""
    if battle.status != Battle.PLAYING:
        raise ValidationError({"detail": "La batalla no está en juego."})
    if player.status != BattlePlayer.ACCEPTED:
        raise ValidationError({"detail": "No estás en esta batalla."})
    rounds = list(battle.rounds.all())
    phase = phase_at(rounds, now, settings.BATTLES["REVEAL_SECONDS"])
    if phase.name != "playing":
        raise ValidationError({"detail": "No hay una ronda abierta."})
    current = rounds[phase.index]
    try:
        guessed = Song.objects.get(pk=song_id)
    except (Song.DoesNotExist, ValueError, TypeError):
        raise ValidationError({"detail": "Canción no encontrada."})
    cfg = settings.BATTLES
    correct = guessed.pk == current.song_id
    points = 0
    if correct:
        elapsed = (now - current.starts_at).total_seconds()
        points = cfg["BASE_POINTS"] + round(cfg["BONUS_MAX"] * (1 - elapsed / battle.round_seconds))
    try:
        with transaction.atomic():
            answer = BattleAnswer.objects.create(round=current, player=player, song_guessed=guessed, correct=correct, received_at=now, points=points)
    except IntegrityError:
        return BattleAnswer.objects.get(round=current, player=player)  # the first answer stands
    Battle.objects.filter(pk=battle.pk).update(version=F("version") + 1)
    return answer


def ranking(battle):
    """The battle's ranking: points, then hits, then name. Points are the sum of the answers, never stored on the player."""
    rows = [
        {"name": p.display_name, "points": p.total or 0, "correct": p.hits or 0}
        for p in battle.players.filter(status=BattlePlayer.ACCEPTED).annotate(total=Sum("answers__points"), hits=Count("answers", filter=Q(answers__correct=True)))
    ]
    rows.sort(key=lambda r: (-r["points"], -r["correct"], r["name"].lower()))
    for position, row in enumerate(rows, start=1):
        row["position"] = position
    return rows


def my_battles(caller):
    """The battles the caller took part in or created: only those, never anybody else's."""
    if caller.user is not None:
        scope = Q(host_user=caller.user) | Q(players__user=caller.user)
    else:
        scope = Q(host_device_id=caller.device_id, host_user__isnull=True) | Q(players__device_id=caller.device_id, players__user__isnull=True)
    # The ids first and the count after: filtering through the players and counting through them in the same query would count
    # only the caller's own row.
    mine_ids = Battle.objects.filter(scope).values("pk")
    battles = Battle.objects.filter(pk__in=mine_ids).annotate(players_count=Count("players", filter=Q(players__status=BattlePlayer.ACCEPTED))).order_by("-created_at", "-id")[:50]
    out = []
    for b in battles:
        mine = player_for(b, caller)
        position = None
        if mine is not None and b.status == Battle.FINISHED:
            position = next((r["position"] for r in ranking(b) if r["name"] == mine.display_name), None)
        out.append(
            {
                "code": b.code,
                "title": b.title,
                "status": b.status,
                "created_at": b.created_at.isoformat(),
                "players_count": b.players_count,
                "role": "player" if mine else "host",
                "my_position": position,
            }
        )
    return out


def review_player(battle, player_id, accept):
    """The organizer accepts or turns away someone in the lobby (turning away an accepted player takes him out)."""
    if not isinstance(accept, bool):
        raise ValidationError({"accept": "Tiene que ser verdadero o falso."})
    try:
        player = battle.players.get(pk=player_id)
    except (BattlePlayer.DoesNotExist, ValueError, TypeError):
        raise ValidationError({"player_id": "No encontramos a esa persona en la sala."})
    player.status = BattlePlayer.ACCEPTED if accept else BattlePlayer.REJECTED
    player.save(update_fields=["status"])
    Battle.objects.filter(pk=battle.pk).update(version=F("version") + 1)
    return player


def _assign_teams(battle):
    """When the battle starts, whoever has no team yet goes (in random order) to the team with the fewest people, so the teams end
    up balanced. In "manual" rooms only the ones the organizer left out are spread; in "random" rooms that is everybody."""
    if battle.team_mode == Battle.NO_TEAMS:
        return
    teams = list(battle.teams.all())
    counts = {t.pk: 0 for t in teams}
    for team_id in battle.players.filter(status=BattlePlayer.ACCEPTED, team__isnull=False).values_list("team_id", flat=True):
        counts[team_id] += 1
    loose = list(battle.players.filter(status=BattlePlayer.ACCEPTED, team__isnull=True))
    random.shuffle(loose)
    for player in loose:
        target = min(teams, key=lambda t: (counts[t.pk], t.index))
        player.team = target
        player.save(update_fields=["team"])
        counts[target.pk] += 1
    # Competing by teams needs at least two with people (one is enough while the mode is only being tried out).
    if sum(1 for n in counts.values() if n > 0) < min(2, min_players()):
        raise ValidationError({"detail": "Hacen falta jugadores en al menos dos equipos."})


def assign_team(battle, player_id, team_id):
    """The organizer puts an accepted player in a team (or takes him out of it with `team_id` None). Only in "manual" rooms."""
    if battle.team_mode != Battle.MANUAL_TEAMS:
        raise ValidationError({"detail": "Esta sala no arma los equipos a mano."})
    try:
        player = battle.players.get(pk=player_id, status=BattlePlayer.ACCEPTED)
    except (BattlePlayer.DoesNotExist, ValueError, TypeError):
        raise ValidationError({"player_id": "No encontramos a esa persona entre los jugadores."})
    team = None
    if team_id is not None:
        try:
            team = battle.teams.get(pk=team_id)
        except (BattleTeam.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"team_id": "No encontramos a ese equipo."})
    player.team = team
    player.save(update_fields=["team"])
    Battle.objects.filter(pk=battle.pk).update(version=F("version") + 1)
    return player


def team_ranking(battle):
    """Teams ranked by the average points of their members (fair with uneven teams), then by their total, then by name."""
    totals = {}
    for player in battle.players.filter(status=BattlePlayer.ACCEPTED, team__isnull=False).annotate(
        total=Sum("answers__points"), hits=Count("answers", filter=Q(answers__correct=True))
    ):
        row = totals.setdefault(player.team_id, {"members": 0, "total": 0, "correct": 0})
        row["members"] += 1
        row["total"] += player.total or 0
        row["correct"] += player.hits or 0
    rows = []
    for team in battle.teams.all():
        row = totals.get(team.pk)
        if row is None:
            continue  # nobody in it: it does not compete
        rows.append(
            {
                "id": team.pk,
                "name": team.name,
                "color": team.color,
                "members": row["members"],
                "points": round(row["total"] / row["members"]),
                "total": row["total"],
                "correct": row["correct"],
            }
        )
    rows.sort(key=lambda r: (-r["points"], -r["total"], r["name"].lower()))
    for position, row in enumerate(rows, start=1):
        row["position"] = position
    return rows
