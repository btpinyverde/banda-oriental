"""A hidden song (duplicate or classical) is out of the game, the archive and the counts, but still there."""

import pytest
from django.contrib import admin

from catalog.models import Album, Artist, Song


@pytest.fixture
def data(db):
    artist = Artist.objects.create(mbid="a", name="Jorge Drexler")
    album = Album.objects.create(mbid="al", name="Vaivén", artist=artist, year=1996)
    visible = Song.objects.create(mbid="s1", title="Luna negra", album=album)
    gone = Song.objects.create(mbid="s2", title="Luna negra (otra)", album=album, hidden=True, hidden_reason="duplicate")
    return {"artist": artist, "album": album, "visible": visible, "hidden": gone}


def test_it_is_not_offered_in_the_game_search_box(client, data):
    titles = [s["title"] for s in client.get("/api/songs/").json()["songs"]]

    assert titles == ["Luna negra"]


def test_it_does_not_count_in_the_albums_the_site_explores(client, data):
    [album] = client.get("/api/albums/").json()["albums"]

    assert album["songs"] == 1


def test_an_album_with_only_hidden_songs_disappears_from_the_lists(client, data):
    Song.objects.filter(pk=data["visible"].pk).update(hidden=True)

    assert client.get("/api/albums/").json()["albums"] == []
    assert client.get("/api/catalog/albums/").json()["count"] == 0
    assert client.get("/api/catalog/artists/").json()["count"] == 0


def test_the_archive_never_shows_it(client, data):
    songs = client.get("/api/catalog/songs/").json()
    search = client.get("/api/catalog/search/", {"q": "luna"}).json()

    assert [s["title"] for s in songs["results"]] == ["Luna negra"]
    assert search["songs"]["total"] == 1
    assert client.get(f"/api/catalog/songs/{data['hidden'].pk}/").status_code == 404
    assert [s["title"] for s in client.get(f"/api/catalog/albums/{data['album'].pk}/").json()["songs"]] == ["Luna negra"]


def test_the_admin_still_sees_it_and_can_filter_by_it():
    from catalog.admin import SongAdmin

    model_admin = SongAdmin(Song, admin.site)

    assert "hidden" in model_admin.list_filter
    assert "hidden" in model_admin.list_display
