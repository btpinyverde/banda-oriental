import pytest
from django.db import IntegrityError

from catalog.models import Album, Artist, Song, SyncState


@pytest.mark.django_db
def test_artist_mbid_is_unique():
    Artist.objects.create(mbid="abb91078-f7db-41f2-8f07-7f37bb739143", name="Jorge Drexler")
    with pytest.raises(IntegrityError):
        Artist.objects.create(mbid="abb91078-f7db-41f2-8f07-7f37bb739143", name="Duplicate")


@pytest.mark.django_db
def test_album_links_to_artist_and_allows_sparse_fields():
    artist = Artist.objects.create(mbid="artist-mbid", name="Jorge Drexler")
    album = Album.objects.create(
        mbid="92a52b9a-855e-364d-a552-ecf29a5a4200",
        name="Vaivén",
        artist=artist,
        year=None,
        genre="",
        cover_art_url="",
    )
    assert album.artist == artist
    assert artist.albums.get() == album


@pytest.mark.django_db
def test_song_links_to_album_and_duration_is_optional():
    artist = Artist.objects.create(mbid="artist-mbid", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-mbid", name="Vaivén", artist=artist)
    song = Song.objects.create(
        mbid="df8b85ee-61f7-47af-baa0-3864546bd686",
        title="Luna negra",
        album=album,
        duration_seconds=None,
    )
    assert song.album == album


@pytest.mark.django_db
def test_sync_state_get_or_create_defaults_to_offset_zero():
    state = SyncState.get_solo()
    assert state.musicbrainz_offset == 0
