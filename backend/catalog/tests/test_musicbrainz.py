from unittest.mock import MagicMock, patch

from catalog.musicbrainz import (
    get_album_release_groups,
    get_release_for_release_group,
    get_tracklist,
    search_uruguayan_artists,
)

ARTIST_SEARCH_RESPONSE = {
    "count": 1040,
    "offset": 0,
    "artists": [
        {"id": "b8468bc4-a202-4c2a-ba1e-7dc75d9cbcf0", "name": "Leo Masliah", "country": "UY"},
        {"id": "abb91078-f7db-41f2-8f07-7f37bb739143", "name": "Jorge Drexler", "country": "UY"},
    ],
}

RELEASE_GROUPS_RESPONSE = {
    "release-group-count": 17,
    "release-group-offset": 0,
    "release-groups": [
        {
            "id": "92a52b9a-855e-364d-a552-ecf29a5a4200",
            "title": "Vaivén",
            "first-release-date": "1996",
            "primary-type": "Album",
            "genres": [],
        },
        {
            "id": "no-date-mbid",
            "title": "Untitled Demo",
            "first-release-date": "",
            "primary-type": "Album",
            "genres": [{"name": "singer-songwriter"}],
        },
        {
            "id": "compilation-mbid",
            "title": "Grandes éxitos",
            "first-release-date": "2005",
            "primary-type": "Album",
            "secondary-types": ["Compilation"],
            "genres": [],
        },
    ],
}

RELEASES_RESPONSE = {
    "release-count": 1,
    "releases": [
        {
            "id": "9e80a911-a74a-4290-aa8a-159fb97351ad",
            "cover-art-archive": {"front": True, "back": False, "artwork": True, "count": 1},
        }
    ],
}

RELEASES_RESPONSE_NO_RELEASES = {"release-count": 0, "releases": []}

RELEASE_WITH_RECORDINGS_RESPONSE = {
    "title": "Vaivén",
    "media": [
        {
            "tracks": [
                {
                    "number": "1",
                    "title": "Luna negra",
                    "length": 186493,
                    "recording": {"id": "df8b85ee-61f7-47af-baa0-3864546bd686"},
                },
                {
                    "number": "2",
                    "title": "Sin duración",
                    "recording": {"id": "no-length-mbid"},
                },
            ]
        }
    ],
}


def _mock_response(json_body):
    response = MagicMock()
    response.json.return_value = json_body
    response.raise_for_status.return_value = None
    return response


@patch("catalog.musicbrainz._get")
def test_search_uruguayan_artists_parses_id_and_name(mock_get):
    mock_get.return_value = _mock_response(ARTIST_SEARCH_RESPONSE)
    artists, total = search_uruguayan_artists(offset=0, limit=25)
    assert total == 1040
    assert artists == [
        {"mbid": "b8468bc4-a202-4c2a-ba1e-7dc75d9cbcf0", "name": "Leo Masliah"},
        {"mbid": "abb91078-f7db-41f2-8f07-7f37bb739143", "name": "Jorge Drexler"},
    ]
    called_path, called_params = mock_get.call_args[0]
    assert called_path == "artist"
    assert called_params == {"query": "country:UY", "offset": 0, "limit": 25}


@patch("catalog.musicbrainz._get")
def test_get_album_release_groups_parses_year_and_handles_missing_genre(mock_get):
    mock_get.return_value = _mock_response(RELEASE_GROUPS_RESPONSE)
    groups = get_album_release_groups("abb91078-f7db-41f2-8f07-7f37bb739143")
    assert groups[0] == {
        "mbid": "92a52b9a-855e-364d-a552-ecf29a5a4200",
        "title": "Vaivén",
        "year": 1996,
        "genre": "",
    }
    assert groups[1] == {
        "mbid": "no-date-mbid",
        "title": "Untitled Demo",
        "year": None,
        "genre": "singer-songwriter",
    }


@patch("catalog.musicbrainz._get")
def test_get_album_release_groups_excludes_compilations_and_other_secondary_types(mock_get):
    # The same recording routinely appears on both the original album and a
    # "Grandes éxitos" compilation (or a live album) — syncing both would
    # let whichever is processed last steal the song's album/year.
    mock_get.return_value = _mock_response(RELEASE_GROUPS_RESPONSE)
    groups = get_album_release_groups("abb91078-f7db-41f2-8f07-7f37bb739143")
    assert [g["mbid"] for g in groups] == [
        "92a52b9a-855e-364d-a552-ecf29a5a4200",
        "no-date-mbid",
    ]


@patch("catalog.musicbrainz._get")
def test_get_release_for_release_group_reports_cover_art_availability(mock_get):
    mock_get.return_value = _mock_response(RELEASES_RESPONSE)
    release = get_release_for_release_group("92a52b9a-855e-364d-a552-ecf29a5a4200")
    assert release == {"mbid": "9e80a911-a74a-4290-aa8a-159fb97351ad", "has_cover_art": True}


@patch("catalog.musicbrainz._get")
def test_get_release_for_release_group_returns_none_when_no_releases(mock_get):
    mock_get.return_value = _mock_response(RELEASES_RESPONSE_NO_RELEASES)
    assert get_release_for_release_group("empty-mbid") is None


@patch("catalog.musicbrainz._get")
def test_get_tracklist_parses_tracks_and_handles_missing_length(mock_get):
    mock_get.return_value = _mock_response(RELEASE_WITH_RECORDINGS_RESPONSE)
    tracks = get_tracklist("9e80a911-a74a-4290-aa8a-159fb97351ad")
    assert tracks == [
        {
            "mbid": "df8b85ee-61f7-47af-baa0-3864546bd686",
            "title": "Luna negra",
            "duration_seconds": 186,
        },
        {
            "mbid": "no-length-mbid",
            "title": "Sin duración",
            "duration_seconds": None,
        },
    ]


@patch("catalog.musicbrainz.time.sleep")
@patch("catalog.musicbrainz.requests.get")
def test_consecutive_requests_are_rate_limited(mock_requests_get, mock_sleep):
    # Patches requests.get (not _get) so _throttle()'s real logic runs —
    # patching _get itself would bypass the throttle entirely and prove
    # nothing.
    mock_requests_get.return_value = _mock_response(ARTIST_SEARCH_RESPONSE)
    search_uruguayan_artists(offset=0, limit=25)
    search_uruguayan_artists(offset=25, limit=25)
    assert mock_sleep.called
