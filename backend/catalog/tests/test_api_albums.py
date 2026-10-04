"""The catalog grouped by album, for the pages that explore it (artists, eras, genres). Much smaller than the list of
every song, so it stays in the site's cache whatever the size of the catalog. It never says which song is today's."""

import pytest
from django.urls import reverse

from catalog.models import Album, Artist, Song


def _album(artist_name="Jorge Drexler", album_name="Eco", year=2004, genre="Pop", songs=2, mbid_prefix=""):
    artist, _ = Artist.objects.get_or_create(mbid=f"a-{artist_name}", defaults={"name": artist_name})
    album = Album.objects.create(mbid=f"al-{mbid_prefix}{album_name}", name=album_name, artist=artist, year=year, genre=genre)
    for n in range(songs):
        Song.objects.create(mbid=f"s-{mbid_prefix}{album_name}-{n}", title=f"Tema {n}", album=album)
    return album


@pytest.mark.django_db
def test_lists_each_album_with_its_artist_year_genre_and_number_of_songs(client):
    _album("Jorge Drexler", "Eco", 2004, "Pop", songs=3)

    response = client.get(reverse("catalog:albums"))

    assert response.status_code == 200
    assert response.json() == {"albums": [{"artist": "Jorge Drexler", "album": "Eco", "year": 2004, "genre": "Pop", "songs": 3}]}


@pytest.mark.django_db
def test_an_album_with_no_songs_is_left_out(client):
    _album("A", "Vacío", songs=0)
    _album("B", "Con canciones", songs=1)

    assert [a["album"] for a in client.get(reverse("catalog:albums")).json()["albums"]] == ["Con canciones"]


@pytest.mark.django_db
def test_it_is_ordered_by_artist_then_year_then_album(client):
    _album("Rubén Rada", "Tarde", 1999)
    _album("Jorge Drexler", "Nuevo", 2010)
    _album("Jorge Drexler", "Viejo", 1996)

    names = [(a["artist"], a["album"]) for a in client.get(reverse("catalog:albums")).json()["albums"]]

    assert names == [("Jorge Drexler", "Viejo"), ("Jorge Drexler", "Nuevo"), ("Rubén Rada", "Tarde")]


@pytest.mark.django_db
def test_an_album_without_year_or_genre_is_still_listed(client):
    artist = Artist.objects.create(mbid="a", name="Artista")
    album = Album.objects.create(mbid="al", artist=artist, name="Sin datos", year=None, genre="")
    Song.objects.create(mbid="s", title="Tema", album=album)

    [entry] = client.get(reverse("catalog:albums")).json()["albums"]

    assert entry["year"] is None and entry["genre"] == ""


@pytest.mark.django_db
def test_the_answer_is_kept_for_a_few_minutes_so_repeating_it_does_not_touch_the_database(client, django_assert_num_queries):
    _album()
    client.get(reverse("catalog:albums"))

    with django_assert_num_queries(0):
        response = client.get(reverse("catalog:albums"))

    assert response["Cache-Control"] == "public, max-age=300"


@pytest.mark.django_db
@pytest.mark.parametrize("change", ["new_song", "delete_song", "edit_album", "edit_artist"])
def test_a_change_made_one_by_one_shows_up_right_away(client, change):
    album = _album("Jorge Drexler", "Eco", songs=1)
    client.get(reverse("catalog:albums"))  # warms the cache

    if change == "new_song":
        Song.objects.create(mbid="nueva", title="Otra", album=album)
    elif change == "delete_song":
        Song.objects.filter(album=album).delete()
    elif change == "edit_album":
        album.genre = "Candombe"
        album.save()
    else:
        album.artist.name = "J. Drexler"
        album.artist.save()

    body = client.get(reverse("catalog:albums")).json()["albums"]

    if change == "new_song":
        assert body[0]["songs"] == 2
    elif change == "delete_song":
        assert body == []
    elif change == "edit_album":
        assert body[0]["genre"] == "Candombe"
    else:
        assert body[0]["artist"] == "J. Drexler"


@pytest.mark.django_db
def test_it_is_public_read_only_and_says_nothing_about_the_daily_song(client):
    _album()

    assert client.post(reverse("catalog:albums")).status_code == 405
    assert "daily" not in client.get(reverse("catalog:albums")).content.decode().lower()
