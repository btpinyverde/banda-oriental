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


# ---------- resilience: MusicBrainz says "slow down" or the network hiccups ----------

import pytest
import requests

from catalog import musicbrainz


def _http(status, body=None, headers=None):
    response = MagicMock()
    response.status_code = status
    response.headers = headers or {}
    response.json.return_value = body if body is not None else {}
    if status >= 400:
        response.raise_for_status.side_effect = requests.HTTPError(f"{status} error", response=response)
    else:
        response.raise_for_status.return_value = None
    return response


def _waits(mock_sleep):
    """The long waits (retries), leaving out the ~1 s spacing between requests."""
    return [call.args[0] for call in mock_sleep.call_args_list if call.args[0] >= 5]


@patch("catalog.musicbrainz.time.sleep")
@patch("catalog.musicbrainz.requests.get")
class TestRetries:
    def test_a_503_is_retried_and_the_data_comes_back(self, mock_get, mock_sleep):
        mock_get.side_effect = [_http(503), _http(200, ARTIST_SEARCH_RESPONSE)]

        artists, total = search_uruguayan_artists(offset=0, limit=25)

        assert total == 1040 and len(artists) == 2
        assert mock_get.call_count == 2
        assert len(_waits(mock_sleep)) == 1

    @pytest.mark.parametrize("status", [429, 502, 503, 504])
    def test_every_try_again_later_status_is_retried(self, mock_get, mock_sleep, status):
        mock_get.side_effect = [_http(status), _http(200, ARTIST_SEARCH_RESPONSE)]

        artists, _ = search_uruguayan_artists(offset=0, limit=25)

        assert len(artists) == 2 and mock_get.call_count == 2

    def test_it_waits_as_long_as_retry_after_asks(self, mock_get, mock_sleep):
        mock_get.side_effect = [_http(503, headers={"Retry-After": "42"}), _http(200, ARTIST_SEARCH_RESPONSE)]

        search_uruguayan_artists(offset=0, limit=25)

        assert _waits(mock_sleep) == [42]

    def test_it_never_waits_more_than_five_minutes_whatever_the_server_asks(self, mock_get, mock_sleep):
        mock_get.side_effect = [_http(429, headers={"Retry-After": "99999"}), _http(200, ARTIST_SEARCH_RESPONSE)]

        search_uruguayan_artists(offset=0, limit=25)

        assert _waits(mock_sleep) == [300]

    def test_without_retry_after_it_waits_longer_each_time(self, mock_get, mock_sleep):
        mock_get.side_effect = [_http(503), _http(503), _http(503), _http(200, ARTIST_SEARCH_RESPONSE)]

        search_uruguayan_artists(offset=0, limit=25)

        waits = _waits(mock_sleep)
        assert len(waits) == 3 and waits == sorted(waits) and len(set(waits)) == 3

    def test_a_retry_after_that_is_not_a_number_falls_back_to_the_growing_wait(self, mock_get, mock_sleep):
        mock_get.side_effect = [_http(503, headers={"Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT"}), _http(200, ARTIST_SEARCH_RESPONSE)]

        search_uruguayan_artists(offset=0, limit=25)

        assert len(_waits(mock_sleep)) == 1 and _waits(mock_sleep)[0] <= 300

    def test_after_six_tries_it_gives_up_with_the_http_error(self, mock_get, mock_sleep):
        mock_get.side_effect = [_http(503)] * 10

        with pytest.raises(requests.HTTPError):
            search_uruguayan_artists(offset=0, limit=25)

        assert mock_get.call_count == 6

    def test_a_timeout_or_a_dropped_connection_is_retried_too(self, mock_get, mock_sleep):
        mock_get.side_effect = [requests.Timeout("lento"), requests.ConnectionError("cortada"), _http(200, ARTIST_SEARCH_RESPONSE)]

        artists, _ = search_uruguayan_artists(offset=0, limit=25)

        assert len(artists) == 2 and mock_get.call_count == 3

    def test_a_timeout_that_never_ends_is_raised_not_swallowed(self, mock_get, mock_sleep):
        mock_get.side_effect = requests.Timeout("lento")

        with pytest.raises(requests.Timeout):
            search_uruguayan_artists(offset=0, limit=25)

        assert mock_get.call_count == 6

    @pytest.mark.parametrize("status", [400, 404])
    def test_a_real_error_is_not_retried(self, mock_get, mock_sleep, status):
        mock_get.side_effect = [_http(status), _http(200, ARTIST_SEARCH_RESPONSE)]

        with pytest.raises(requests.HTTPError):
            search_uruguayan_artists(offset=0, limit=25)

        assert mock_get.call_count == 1

    def test_each_request_may_take_up_to_thirty_seconds(self, mock_get, mock_sleep):
        mock_get.return_value = _http(200, ARTIST_SEARCH_RESPONSE)

        search_uruguayan_artists(offset=0, limit=25)

        assert mock_get.call_args.kwargs["timeout"] == 30

    def test_it_still_identifies_itself(self, mock_get, mock_sleep):
        mock_get.return_value = _http(200, ARTIST_SEARCH_RESPONSE)

        search_uruguayan_artists(offset=0, limit=25)

        assert "BandaOriental" in mock_get.call_args.kwargs["headers"]["User-Agent"]


def test_requests_are_spaced_a_little_more_than_the_minimum_the_api_asks_for():
    assert musicbrainz._MIN_INTERVAL_SECONDS >= 1.2


# ---------- listing every Uruguayan artist (the search stops at 500 results; browsing by area does not) ----------

from catalog.musicbrainz import URUGUAY_AREA_MBID, browse_uruguayan_artists


@patch("catalog.musicbrainz._get")
def test_browse_uruguayan_artists_lists_by_area_and_returns_the_total(mock_get):
    mock_get.return_value = _mock_response(
        {"artist-count": 1416, "artist-offset": 600, "artists": [{"id": "a1", "name": "Uno"}, {"id": "a2", "name": "Dos"}]}
    )

    artists, total = browse_uruguayan_artists(offset=600, limit=100)

    assert total == 1416
    assert artists == [{"mbid": "a1", "name": "Uno"}, {"mbid": "a2", "name": "Dos"}]
    path, params = mock_get.call_args[0]
    assert path == "artist"
    assert params == {"area": URUGUAY_AREA_MBID, "offset": 600, "limit": 100}


@patch("catalog.musicbrainz._get")
def test_browse_can_go_past_the_500_results_the_search_is_limited_to(mock_get):
    mock_get.return_value = _mock_response({"artist-count": 1416, "artists": []})

    browse_uruguayan_artists(offset=1400, limit=100)  # a search would answer 400 here

    assert mock_get.call_args[0][1]["offset"] == 1400
