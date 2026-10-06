from unittest.mock import patch

import pytest
from django.core.management import call_command

from catalog.models import Album, Artist, Song, SyncState

ARTISTS_PAGE_1 = (
    [{"mbid": "artist-1", "name": "Jorge Drexler"}],
    1,  # total count
)

RELEASE_GROUPS = [{"mbid": "album-1", "title": "Vaivén", "year": 1996, "genre": ""}]

RELEASE = {"mbid": "release-1", "has_cover_art": True}

TRACKLIST = [
    {"mbid": "song-1", "title": "Luna negra", "duration_seconds": 186},
    {"mbid": "song-2", "title": "Cerca del mar", "duration_seconds": 222},
]


def _run_sync(limit=5):
    with patch("catalog.management.commands.sync_musicbrainz.browse_uruguayan_artists") as mock_search, \
         patch("catalog.management.commands.sync_musicbrainz.get_album_release_groups") as mock_groups, \
         patch("catalog.management.commands.sync_musicbrainz.get_release_for_release_group") as mock_release, \
         patch("catalog.management.commands.sync_musicbrainz.get_tracklist") as mock_tracklist, \
         patch("catalog.management.commands.sync_musicbrainz.get_cover_art_url") as mock_cover:
        mock_search.return_value = ARTISTS_PAGE_1
        mock_groups.return_value = RELEASE_GROUPS
        mock_release.return_value = RELEASE
        mock_tracklist.return_value = TRACKLIST
        mock_cover.return_value = "https://coverartarchive.org/release-1/front-500.jpg"
        call_command("sync_musicbrainz", limit=limit)
        return mock_search, mock_groups, mock_release, mock_tracklist, mock_cover


@pytest.mark.django_db
def test_sync_creates_artist_album_and_songs():
    _run_sync()
    artist = Artist.objects.get(mbid="artist-1")
    assert artist.name == "Jorge Drexler"
    album = Album.objects.get(mbid="album-1")
    assert album.artist == artist
    assert album.year == 1996
    assert album.cover_art_url == "https://coverartarchive.org/release-1/front-500.jpg"
    assert Song.objects.filter(album=album).count() == 2


@pytest.mark.django_db
def test_sync_is_idempotent_and_preserves_manual_edits():
    _run_sync()
    artist = Artist.objects.get(mbid="artist-1")
    artist.instagram_handle = "@jorgedrexler"
    artist.save()

    _run_sync()

    assert Artist.objects.filter(mbid="artist-1").count() == 1
    assert Album.objects.filter(mbid="album-1").count() == 1
    assert Song.objects.filter(album__mbid="album-1").count() == 2
    artist.refresh_from_db()
    assert artist.instagram_handle == "@jorgedrexler"


@pytest.mark.django_db
def test_sync_skips_album_with_no_releases():
    with patch("catalog.management.commands.sync_musicbrainz.browse_uruguayan_artists") as mock_search, \
         patch("catalog.management.commands.sync_musicbrainz.get_album_release_groups") as mock_groups, \
         patch("catalog.management.commands.sync_musicbrainz.get_release_for_release_group") as mock_release, \
         patch("catalog.management.commands.sync_musicbrainz.get_tracklist") as mock_tracklist:
        mock_search.return_value = ARTISTS_PAGE_1
        mock_groups.return_value = RELEASE_GROUPS
        mock_release.return_value = None  # no releases for this release-group
        call_command("sync_musicbrainz", limit=5)
        mock_tracklist.assert_not_called()

    assert Album.objects.filter(mbid="album-1").exists()
    assert not Song.objects.exists()


@pytest.mark.django_db
def test_sync_advances_and_wraps_the_offset():
    with patch("catalog.management.commands.sync_musicbrainz.browse_uruguayan_artists") as mock_search, \
         patch("catalog.management.commands.sync_musicbrainz.get_album_release_groups", return_value=[]):
        mock_search.return_value = ([{"mbid": "artist-1", "name": "A"}], 1)
        call_command("sync_musicbrainz", limit=5)

        state = SyncState.get_solo()
        assert state.musicbrainz_offset == 0  # wrapped: 1 artist total, offset+1 >= count

        mock_search.return_value = (
            [{"mbid": f"artist-{i}", "name": f"Artist {i}"} for i in range(5)],
            12,
        )
        call_command("sync_musicbrainz", limit=5)

        state.refresh_from_db()
        assert state.musicbrainz_offset == 5


@pytest.mark.django_db
def test_sync_does_not_overwrite_good_album_data_with_empty_resync_data():
    _run_sync()
    album = Album.objects.get(mbid="album-1")
    album.genre = "Candombe"
    album.cover_art_url = "https://existing.example/good-cover.jpg"
    album.year = 1990
    album.save()

    # Re-sync where MusicBrainz/Cover Art Archive come back empty this time
    # (e.g. a transient gap, or genre data MusicBrainz just doesn't have).
    with patch("catalog.management.commands.sync_musicbrainz.browse_uruguayan_artists") as mock_search, \
         patch("catalog.management.commands.sync_musicbrainz.get_album_release_groups") as mock_groups, \
         patch("catalog.management.commands.sync_musicbrainz.get_release_for_release_group") as mock_release, \
         patch("catalog.management.commands.sync_musicbrainz.get_tracklist", return_value=[]):
        mock_search.return_value = ARTISTS_PAGE_1
        mock_groups.return_value = [
            {"mbid": "album-1", "title": "Vaivén", "year": None, "genre": ""}
        ]
        mock_release.return_value = None  # no cover art available this time
        call_command("sync_musicbrainz", limit=5)

    album.refresh_from_db()
    assert album.genre == "Candombe"
    assert album.cover_art_url == "https://existing.example/good-cover.jpg"
    assert album.year == 1990


@pytest.mark.django_db
def test_sync_continues_past_an_artist_that_fails_and_saves_progress_for_it():
    artists_page = (
        [
            {"mbid": "artist-ok", "name": "Works Fine"},
            {"mbid": "artist-broken", "name": "Breaks"},
            {"mbid": "artist-ok-2", "name": "Also Fine"},
        ],
        3,
    )
    with patch("catalog.management.commands.sync_musicbrainz.browse_uruguayan_artists") as mock_search, \
         patch("catalog.management.commands.sync_musicbrainz.get_album_release_groups") as mock_groups:
        mock_search.return_value = artists_page

        def groups_side_effect(artist_mbid):
            if artist_mbid == "artist-broken":
                raise ValueError("MusicBrainz said no")
            return []

        mock_groups.side_effect = groups_side_effect
        call_command("sync_musicbrainz", limit=5)

    # The broken artist shouldn't crash the batch — its neighbors still sync...
    assert Artist.objects.filter(mbid="artist-ok").exists()
    assert Artist.objects.filter(mbid="artist-ok-2").exists()
    # ...and the offset advances past all 3 attempted artists (wraps to 0
    # since 3 total == 3 attempted), not stuck replaying artist-broken.
    assert SyncState.get_solo().musicbrainz_offset == 0


@pytest.mark.django_db
def test_sync_stops_early_and_saves_progress_when_time_budget_is_exceeded():
    artists_page = (
        [
            {"mbid": "artist-1", "name": "First"},
            {"mbid": "artist-2", "name": "Second"},
            {"mbid": "artist-3", "name": "Third"},
        ],
        10,
    )
    fake_clock = iter([0.0, 0.0, 100.0, 100.0, 100.0, 100.0])
    with patch("catalog.management.commands.sync_musicbrainz.browse_uruguayan_artists") as mock_search, \
         patch("catalog.management.commands.sync_musicbrainz.get_album_release_groups", return_value=[]), \
         patch("catalog.management.commands.sync_musicbrainz.time.monotonic", side_effect=lambda: next(fake_clock)):
        mock_search.return_value = artists_page
        call_command("sync_musicbrainz", limit=5)

    # Only the first artist is synced before the (mocked) clock blows the
    # time budget — the other two are left for the next click.
    assert Artist.objects.filter(mbid="artist-1").exists()
    assert not Artist.objects.filter(mbid="artist-2").exists()
    assert not Artist.objects.filter(mbid="artist-3").exists()
    assert SyncState.get_solo().musicbrainz_offset == 1
