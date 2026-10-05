from datetime import datetime, timedelta, timezone as tz

import pytest

from battles import services
from battles.models import Battle, BattlePlayer
from catalog.models import Album, Artist, Song

HOST = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"
D3 = "33333333-3333-3333-3333-333333333333"
STRANGER = "44444444-4444-4444-4444-444444444444"
T0 = datetime(2026, 10, 5, 20, 0, 0, tzinfo=tz.utc)


def at(seconds):
    return T0 + timedelta(seconds=seconds)


@pytest.fixture
def clock(monkeypatch):
    """The server's clock for the test: call it with seconds after T0."""
    holder = {"now": T0}
    monkeypatch.setattr("django.utils.timezone.now", lambda: holder["now"])

    def set_(seconds):
        holder["now"] = at(seconds)

    return set_


@pytest.fixture
def running(db, monkeypatch):
    """A started battle: 2 rounds of 10 s (round 0 plays at +5..+15, round 1 at +21..+31), host and players Ana and Beto."""
    artist = Artist.objects.create(mbid="a", name="Artista")
    album = Album.objects.create(mbid="al", name="Disco", artist=artist, year=2000)
    for i in range(10):
        Song.objects.create(mbid=f"s{i}", title=f"Tema {i}", album=album, deezer_id=1000 + i)
    monkeypatch.setattr("battles.services.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    monkeypatch.setattr("battles.state.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    b = Battle.objects.create(round_count=2, round_seconds=10, host_device_id=HOST)
    BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    BattlePlayer.objects.create(battle=b, device_id=D3, display_name="Beto")
    services.start_battle(b, now=T0)
    return b
