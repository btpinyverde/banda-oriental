import pytest
from django.db import IntegrityError, transaction

from catalog.models import Album, Artist, Song


@pytest.fixture
def artist(db):
    return Artist.objects.create(mbid="artist-1", name="Jorge Drexler")


@pytest.mark.django_db
def test_albums_and_songs_can_exist_without_a_musicbrainz_id(artist):
    first = Album.objects.create(artist=artist, name="Single uno", deezer_id=1)
    second = Album.objects.create(artist=artist, name="Single dos", deezer_id=2)
    Song.objects.create(album=first, title="Uno", deezer_id=10)
    Song.objects.create(album=second, title="Dos", deezer_id=20)

    assert Album.objects.filter(mbid__isnull=True).count() == 2
    assert Song.objects.filter(mbid__isnull=True).count() == 2


@pytest.mark.django_db
def test_deezer_ids_are_unique_per_kind(artist):
    Album.objects.create(artist=artist, name="Eco", deezer_id=5)

    with pytest.raises(IntegrityError), transaction.atomic():
        Album.objects.create(artist=artist, name="Otro", deezer_id=5)


@pytest.mark.django_db
def test_many_artists_can_be_still_unmatched_to_deezer():
    Artist.objects.create(mbid="a", name="A")
    Artist.objects.create(mbid="b", name="B")

    assert Artist.objects.filter(deezer_id__isnull=True, deezer_checked_at__isnull=True).count() == 2


@pytest.mark.django_db
def test_an_album_is_a_full_album_unless_said_otherwise(artist):
    assert Album.objects.create(artist=artist, name="Vaivén", mbid="x").release_type == "album"
    assert Album.objects.create(artist=artist, name="Luna", deezer_id=9, release_type="single").release_type == "single"
