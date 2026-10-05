from django.conf import settings
from django.core.cache import cache
from django.db.models import F

from gameplay.views import song_payload

from . import services
from .access import min_players
from .identity import is_host, player_for
from .models import Battle, BattleAnswer, BattlePlayer
from .previews import preview_url
from .timeline import phase_at


def _rounds(battle):
    """The rounds never change once the battle started, so they are kept in the cache instead of read on every poll."""
    key = f"battle-rounds:{battle.pk}"
    rounds = cache.get(key)
    if rounds is None:
        rounds = list(battle.rounds.select_related("song__album__artist"))
        cache.set(key, rounds, 3600)
    return rounds


def build_state(battle, caller, token, since, now):
    """What a device polling the battle needs, or None when it has no right to see it (the view answers "not found")."""
    host = is_host(battle, caller, token)
    player = None if host else player_for(battle, caller)
    if not host and player is None:
        if battle.status != Battle.LOBBY:
            return None
        return {
            "joinable": True,
            "server_time": now.isoformat(),
            "code": battle.code,
            "title": battle.title,
            "round_count": battle.round_count,
            "round_seconds": battle.round_seconds,
            "join_mode": battle.join_mode,
            "players_count": battle.players.filter(status=BattlePlayer.ACCEPTED).count(),
        }

    if player is not None and player.status != BattlePlayer.ACCEPTED:
        # Waiting or turned away: only his own status, nothing about the room or its rounds.
        phase_name = "lobby" if battle.status == Battle.LOBBY else "finished"
        return {
            "changed": True,
            "server_time": now.isoformat(),
            "key": f"{battle.version}.{player.status}",
            "code": battle.code,
            "title": battle.title,
            "role": "player",
            "my_status": player.status,
            "status": battle.status,
            "round_count": battle.round_count,
            "round_seconds": battle.round_seconds,
            "phase": {"name": phase_name, "index": 0},
            "round": None,
            "players": [],
            "audio_mode": battle.audio_mode,
            "join_mode": battle.join_mode,
            "min_players": min_players(),
        }

    rounds, phase = [], None
    if battle.status == Battle.LOBBY:
        phase_name, phase_index = "lobby", 0
    else:
        rounds = _rounds(battle)
        phase = phase_at(rounds, now, settings.BATTLES["REVEAL_SECONDS"])
        if phase.name == "finished" and battle.status == Battle.PLAYING:
            # The one write a poll can cause, and it is idempotent: only a battle still "playing" is moved.
            Battle.objects.filter(pk=battle.pk, status=Battle.PLAYING).update(status=Battle.FINISHED, version=F("version") + 1)
            battle.refresh_from_db(fields=["status", "version"])
        phase_name, phase_index = phase.name, phase.index

    key = f"{battle.version}.{phase_name}{phase_index}"
    if since and since == key:
        return {"changed": False, "server_time": now.isoformat()}

    data = {
        "changed": True,
        "server_time": now.isoformat(),
        "key": key,
        "code": battle.code,
        "title": battle.title,
        "role": "host" if host else "player",
        "status": battle.status,
        "round_count": battle.round_count,
        "round_seconds": battle.round_seconds,
        "phase": {"name": phase_name, "index": phase_index},
        "round": None,
        "min_players": min_players(),
        "audio_mode": battle.audio_mode,
        "join_mode": battle.join_mode,
    }
    if player is not None:
        data["my_status"] = player.status

    # In the round being played the host sees who answered; a player only sees whether he did.
    played = rounds[phase_index] if phase and phase.name in ("playing", "reveal") else None
    answered_ids = set(BattleAnswer.objects.filter(round=played).values_list("player_id", flat=True)) if played else set()
    accepted = list(battle.players.filter(status=BattlePlayer.ACCEPTED))
    with_teams = battle.team_mode != Battle.NO_TEAMS
    data["team_mode"] = battle.team_mode
    data["teams"] = [{"id": t.pk, "name": t.name, "color": t.color} for t in battle.teams.all()]
    data["players"] = [
        {
            "name": p.display_name,
            **({"id": p.pk, "answered": p.pk in answered_ids} if host else {}),
            **({"team": p.team_id} if with_teams else {}),
        }
        for p in accepted
    ]
    if player is not None and with_teams:
        data["my_team"] = player.team_id
    if host and battle.status == Battle.LOBBY:
        data["pending"] = [{"id": p.pk, "name": p.display_name} for p in battle.players.filter(status=BattlePlayer.PENDING)]

    if phase is not None and phase.name != "finished":
        # While playing (or counting down) the current round; between rounds the next one, so the device can preload its audio.
        upcoming = rounds[phase.index + 1] if phase.name == "reveal" and phase.index + 1 < len(rounds) else None
        shown = upcoming if phase.name == "reveal" else rounds[phase.index]
        if shown is not None:
            data["round"] = {"index": shown.index, "starts_at": shown.starts_at.isoformat(), "ends_at": shown.ends_at.isoformat()}
            # The music reaches whoever is meant to play it: every player, or only the organizer when he is the host.
            if (host and battle.audio_mode == Battle.HOST) or (player is not None and battle.audio_mode == Battle.EACH):
                data["round"]["preview_url"] = preview_url(shown.song)  # for a YouTube round it is the fallback
                data["round"]["source"] = shown.source
                if shown.source == "youtube":
                    data["round"]["youtube_id"] = shown.youtube_id
                    data["round"]["start_seconds"] = shown.start_seconds
            if player is not None:
                data["round"]["answered"] = BattleAnswer.objects.filter(round=shown, player=player).exists()

    if phase is not None and phase.name in ("reveal", "finished"):
        closed = rounds[phase.index]  # its ends_at has passed by construction: only now is the song sent
        mine = BattleAnswer.objects.filter(round=closed, player=player).select_related("song_guessed").first() if player else None
        data["reveal"] = {
            "song": song_payload(closed.song),
            "my_answer": {"correct": mine.correct, "points": mine.points, "guessed": mine.song_guessed.title if mine and mine.song_guessed else None}
            if mine
            else None,
        }
        data["ranking"] = services.ranking(battle)
        if with_teams:
            data["team_ranking"] = services.team_ranking(battle)
    return data
