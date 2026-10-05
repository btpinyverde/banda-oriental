"""Stage 5: the data the organizer shows on the big screen: how the room answered the round that just closed."""
import pytest
from django.urls import reverse

from battles import services
from battles.models import Battle, BattlePlayer
from catalog.models import Album, Artist, Song

from .conftest import D2, D3, HOST, at

D4 = "55555555-5555-4555-8555-555555555555"


@pytest.fixture(autouse=True)
def open_to_everybody(settings):
    settings.BATTLES = {**settings.BATTLES, "CREATOR_EMAILS": ["*"], "MIN_PLAYERS": 1}


@pytest.fixture
def room(db, monkeypatch, clock):
    """Three players, a battle of 2 rounds of 20 s already started (round 0 runs +5..+25, its reveal +25..+31)."""
    artist = Artist.objects.create(mbid="a", name="Artista")
    album = Album.objects.create(mbid="al", name="Disco", artist=artist, year=2000)
    for i in range(10):
        Song.objects.create(mbid=f"s{i}", title=f"Tema {i}", album=album, deezer_id=1000 + i)
    monkeypatch.setattr("battles.services.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    monkeypatch.setattr("battles.state.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    b = Battle.objects.create(round_count=2, round_seconds=20, host_device_id=HOST)
    for device, name in ((D2, "Ana"), (D3, "Beto"), (D4, "Caro")):
        BattlePlayer.objects.create(battle=b, device_id=device, display_name=name)
    services.start_battle(b, now=at(0))
    return b


def stats_for(client, battle, device, token=""):
    r = client.get(reverse("battles:detail", args=[battle.code]), HTTP_X_DEVICE_ID=device, HTTP_X_HOST_TOKEN=token)
    assert r.status_code == 200
    return r.json()


def players(battle):
    return {p.display_name: p for p in battle.players.all()}


def test_the_organizer_gets_the_round_stats_in_the_reveal(client, room, clock):
    p = players(room)
    right = room.rounds.get(index=0).song_id
    wrong = room.rounds.get(index=1).song_id
    services.submit_answer(room, p["Ana"], right, at(8))    # 3 s in
    services.submit_answer(room, p["Beto"], right, at(15))  # 10 s in
    services.submit_answer(room, p["Caro"], wrong, at(9))
    clock(26)

    stats = stats_for(client, room, HOST, room.host_token)["stats"]
    assert stats["total"] == 3 and stats["answered"] == 3 and stats["correct"] == 2
    assert stats["fastest"] == {"name": "Ana", "seconds": 3.0}
    assert stats["top_guesses"][0] == {"title": room.rounds.get(index=0).song.title, "artist": "Artista", "count": 2, "correct": True}
    assert stats["top_guesses"][1]["count"] == 1 and stats["top_guesses"][1]["correct"] is False


def test_players_never_get_the_stats(client, room, clock):
    clock(26)
    assert "stats" not in stats_for(client, room, D2)


def test_no_stats_while_the_round_is_still_open(client, room, clock):
    clock(10)
    assert "stats" not in stats_for(client, room, HOST, room.host_token)


def test_nobody_answered(client, room, clock):
    clock(26)
    stats = stats_for(client, room, HOST, room.host_token)["stats"]
    assert stats == {"total": 3, "answered": 0, "correct": 0, "fastest": None, "top_guesses": []}


def test_nobody_got_it_right(client, room, clock):
    p = players(room)
    wrong = room.rounds.get(index=1).song_id
    services.submit_answer(room, p["Ana"], wrong, at(8))
    clock(26)
    stats = stats_for(client, room, HOST, room.host_token)["stats"]
    assert stats["correct"] == 0 and stats["fastest"] is None and stats["top_guesses"][0]["correct"] is False


def test_only_the_three_most_chosen_guesses_are_listed(client, room, clock, db):
    extra = [BattlePlayer.objects.create(battle=room, device_id=f"7777777{i}-7777-4777-8777-777777777777", display_name=f"J{i}") for i in range(4)]
    songs = list(Song.objects.exclude(pk=room.rounds.get(index=0).song_id)[:4])
    for player, song in zip(extra, songs):
        services.submit_answer(room, player, song.pk, at(8))
    clock(26)
    assert len(stats_for(client, room, HOST, room.host_token)["stats"]["top_guesses"]) == 3


def test_turned_away_players_are_not_counted(client, room, clock):
    BattlePlayer.objects.filter(display_name="Caro").update(status="rejected")
    clock(26)
    assert stats_for(client, room, HOST, room.host_token)["stats"]["total"] == 2


def test_at_the_end_the_stats_are_those_of_the_last_round(client, room, clock):
    p = players(room)
    last = room.rounds.get(index=1)
    services.submit_answer(room, p["Beto"], last.song_id, at(36))  # round 1 runs +31..+51
    clock(500)
    stats = stats_for(client, room, HOST, room.host_token)
    assert stats["phase"]["name"] == "finished" and stats["stats"]["correct"] == 1 and stats["stats"]["fastest"]["name"] == "Beto"
