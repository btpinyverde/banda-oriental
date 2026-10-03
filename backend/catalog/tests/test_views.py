import pytest
from django.urls import reverse

from catalog.models import Album, Artist, Song


@pytest.mark.django_db
def test_song_list_returns_every_song_ordered_by_title(client):
    artist = Artist.objects.create(mbid="artist-1", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-1", name="Vaivén", artist=artist)
    Song.objects.create(mbid="song-2", title="Zafar", album=album)
    Song.objects.create(mbid="song-1", title="A las nueve", album=album)

    response = client.get(reverse("catalog:song-list"))

    assert response.status_code == 200
    assert response.json() == {
        "songs": [
            {
                "id": Song.objects.get(title="A las nueve").id,
                "title": "A las nueve",
                "artist": "Jorge Drexler",
            },
            {
                "id": Song.objects.get(title="Zafar").id,
                "title": "Zafar",
                "artist": "Jorge Drexler",
            },
        ]
    }


@pytest.mark.django_db
def test_song_list_is_empty_when_catalog_has_no_songs(client):
    response = client.get(reverse("catalog:song-list"))

    assert response.status_code == 200
    assert response.json() == {"songs": []}
