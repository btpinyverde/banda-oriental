from datetime import timedelta

import pytest
from django.urls import reverse

from battles.models import Battle, BattlePlayer
from catalog.models import Album, Artist, Song

HOST = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"
D3 = "33333333-3333-3333-3333-333333333333"


@pytest.fixture
def songs(db):
    artist = Artist.objects.create(mbid="a", name="Artista")
    album = Album.objects.create(mbid="al", name="Disco", artist=artist, year=2000)
    return [Song.objects.create(mbid=f"s{i}", title=f"Tema {i}", album=album, deezer_id=1000 + i) for i in range(12)]


@pytest.fixture
def battle(db):
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    BattlePlayer.objects.create(battle=b, device_id=D3, display_name="Beto")
    return b


@pytest.fixture(autouse=True)
def previews(monkeypatch):
    monkeypatch.setattr("battles.services.preview_url", lambda song: f"https://cdn/{song.deezer_id}.mp3")


def start(client, battle, device=HOST, token=""):
    return client.post(reverse("battles:start", args=[battle.code]), data={}, content_type="application/json", HTTP_X_DEVICE_ID=device, HTTP_X_HOST_TOKEN=token)


def test_start_creates_the_rounds_and_the_schedule(client, battle, songs):
    r = start(client, battle)
    assert r.status_code == 200
    battle.refresh_from_db()
    assert battle.status == Battle.PLAYING and battle.started_at is not None
    rounds = list(battle.rounds.all())
    assert [x.index for x in rounds] == [0, 1, 2]
    assert len({x.song_id for x in rounds}) == 3
    assert rounds[0].starts_at == battle.started_at + timedelta(seconds=5)
    assert rounds[1].starts_at == rounds[0].ends_at + timedelta(seconds=6)


def test_only_the_host_can_start_and_others_get_not_found(client, battle, songs):
    assert start(client, battle, device=D2).status_code == 404
    assert start(client, battle, device="44444444-4444-4444-4444-444444444444").status_code == 404
    assert start(client, battle, device=D3, token=battle.host_token).status_code == 200  # the token is enough


def test_needs_at_least_two_players(client, songs, db):
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    r = start(client, b)
    assert r.status_code == 400 and "al menos otra persona" in str(r.json())


def test_skips_songs_without_preview_and_hidden_ones(client, battle, songs, monkeypatch):
    songs[0].hidden = True
    songs[0].save()
    monkeypatch.setattr("battles.services.preview_url", lambda song: None if song.deezer_id % 2 else f"https://cdn/{song.deezer_id}.mp3")
    assert start(client, battle).status_code == 200
    for x in battle.rounds.all():
        assert x.song.deezer_id % 2 == 0 and not x.song.hidden


def test_fails_cleanly_when_not_enough_songs_have_preview(client, battle, songs, monkeypatch):
    monkeypatch.setattr("battles.services.preview_url", lambda song: None)
    r = start(client, battle)
    assert r.status_code == 400
    battle.refresh_from_db()
    assert battle.status == Battle.LOBBY and battle.rounds.count() == 0


def test_cannot_start_twice(client, battle, songs):
    start(client, battle)
    assert start(client, battle).status_code == 404  # no longer in its lobby
