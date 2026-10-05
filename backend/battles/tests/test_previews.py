import pytest

from battles import previews
from catalog.models import Album, Artist, Song


@pytest.fixture
def song(db):
    artist = Artist.objects.create(mbid="a1", name="Jorge Drexler")
    album = Album.objects.create(mbid="al1", name="Eco", artist=artist, year=2004)
    return Song.objects.create(mbid="s1", title="Al otro lado del río", album=album, deezer_id=777)


def test_asks_deezer_once_and_caches_the_url(song, monkeypatch):
    calls = []
    monkeypatch.setattr(previews.deezer, "get_track_preview", lambda track_id: calls.append(track_id) or "https://cdn/x.mp3")
    assert previews.preview_url(song) == "https://cdn/x.mp3"
    assert previews.preview_url(song) == "https://cdn/x.mp3"
    assert calls == [777]


def test_song_without_deezer_id_has_no_preview(song, monkeypatch):
    song.deezer_id = None
    monkeypatch.setattr(previews.deezer, "get_track_preview", lambda track_id: pytest.fail("must not ask"))
    assert previews.preview_url(song) is None


def test_deezer_failure_gives_none_and_is_not_cached(song, monkeypatch):
    def boom(track_id):
        raise previews.deezer.DeezerError("down")

    monkeypatch.setattr(previews.deezer, "get_track_preview", boom)
    assert previews.preview_url(song) is None
    monkeypatch.setattr(previews.deezer, "get_track_preview", lambda track_id: "https://cdn/y.mp3")
    assert previews.preview_url(song) == "https://cdn/y.mp3"
