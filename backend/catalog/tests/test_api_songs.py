import pytest
from django.urls import reverse

from catalog.models import Album, Artist, Song


def _song(mbid, title, artist_name="Jorge Drexler", album_name="Eco", year=2004, genre="Pop"):
    artist, _ = Artist.objects.get_or_create(mbid=f"a-{artist_name}", defaults={"name": artist_name})
    album, _ = Album.objects.get_or_create(
        mbid=f"al-{album_name}", defaults={"name": album_name, "artist": artist, "year": year, "genre": genre}
    )
    return Song.objects.create(mbid=mbid, title=title, album=album)


@pytest.mark.django_db
def test_lists_every_song_with_the_data_the_guess_table_shows(client):
    song = _song("s1", "Al otro lado del río")

    response = client.get(reverse("catalog:songs"))

    assert response.status_code == 200
    assert response.json() == {
        "songs": [
            {
                "id": song.id,
                "title": "Al otro lado del río",
                "artist": "Jorge Drexler",
                "album": "Eco",
                "year": 2004,
                "genre": "Pop",
            }
        ]
    }


@pytest.mark.django_db
def test_is_ordered_by_artist_then_title(client):
    _song("s1", "Zeta", artist_name="Rubén Rada", album_name="Candombe")
    _song("s2", "Beta", artist_name="Jorge Drexler")
    _song("s3", "Alfa", artist_name="Jorge Drexler")

    titles = [s["title"] for s in client.get(reverse("catalog:songs")).json()["songs"]]

    assert titles == ["Alfa", "Beta", "Zeta"]


@pytest.mark.django_db
def test_an_album_without_year_or_genre_still_lists_its_songs(client):
    artist = Artist.objects.create(mbid="a", name="Artista")
    album = Album.objects.create(mbid="al", artist=artist, name="Sin datos")
    Song.objects.create(mbid="s", album=album, title="Tema")

    song = client.get(reverse("catalog:songs")).json()["songs"][0]

    assert song["year"] is None
    assert song["genre"] == ""


@pytest.mark.django_db
def test_empty_catalog_is_an_empty_list_not_an_error(client):
    response = client.get(reverse("catalog:songs"))

    assert response.status_code == 200
    assert response.json() == {"songs": []}


@pytest.mark.django_db
def test_does_not_require_a_device_id_and_can_be_cached_briefly(client):
    response = client.get(reverse("catalog:songs"))

    assert response.status_code == 200
    assert "max-age=300" in response["Cache-Control"]


@pytest.mark.django_db
def test_does_not_run_a_query_per_song(client, django_assert_max_num_queries):
    for n in range(20):
        _song(f"s{n}", f"Tema {n}", artist_name=f"Artista {n}", album_name=f"Disco {n}")

    with django_assert_max_num_queries(3):
        client.get(reverse("catalog:songs"))


@pytest.mark.django_db
def test_only_get_is_allowed(client):
    assert client.post(reverse("catalog:songs")).status_code == 405


@pytest.mark.django_db
@pytest.mark.parametrize("title", ["-", "---", "...", "( )", "(_)", "-‐‐-", "--------------------", "   "])
def test_hides_songs_whose_title_is_only_symbols(client, title):
    # Imported tracks titled "-" or "..." can't be told apart in the search box and nobody can guess them.
    _song("s-bad", title)
    keep = _song("s-ok", "Alfa")

    songs = client.get(reverse("catalog:songs")).json()["songs"]

    assert [s["id"] for s in songs] == [keep.id]


@pytest.mark.django_db
@pytest.mark.parametrize("title", ["1987", "007", "3:45", "¿Y?", "Y la nave va...", "A.F.C.", "Ñ"])
def test_keeps_titles_that_have_at_least_a_letter_or_digit(client, title):
    song = _song("s1", title)

    songs = client.get(reverse("catalog:songs")).json()["songs"]

    assert [s["id"] for s in songs] == [song.id]
