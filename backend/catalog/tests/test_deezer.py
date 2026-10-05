from unittest.mock import MagicMock, patch

import pytest
import requests

from catalog import deezer
from catalog.deezer import DeezerError, DeezerNotFound, get_album, get_artist, get_artist_releases, search_artists


@pytest.fixture(autouse=True)
def no_waiting():
    with patch("catalog.deezer._throttle"), patch("catalog.deezer.time.sleep") as sleep:
        yield sleep


def _response(body, status=200):
    response = MagicMock()
    response.status_code = status
    response.json.return_value = body
    return response


def _patch_get(*responses):
    return patch("catalog.deezer.requests.get", side_effect=list(responses))


class TestSearchArtists:
    def test_returns_normalized_candidates(self):
        body = {"data": [{"id": 4347, "name": "Jorge Drexler", "nb_album": 43, "nb_fan": 91330, "extra": "x"}]}
        with _patch_get(_response(body)) as get:
            result = search_artists("Jorge Drexler")

        assert result == [{"id": 4347, "name": "Jorge Drexler", "nb_album": 43, "nb_fan": 91330, "picture": ""}]
        assert get.call_args.args[0] == "https://api.deezer.com/search/artist"
        assert get.call_args.kwargs["params"]["q"] == "Jorge Drexler"
        assert get.call_args.kwargs["timeout"] == 15

    def test_no_results_is_an_empty_list(self):
        with _patch_get(_response({"data": [], "total": 0})):
            assert search_artists("Nadie") == []


PHOTO = "https://cdn-images.dzcdn.net/images/artist/abc123/1000x1000-000000-80-0-0.jpg"
# What Deezer gives to an artist that has no photo: a URL with an empty hash. It is a grey silhouette, not a photo.
PLACEHOLDER = "https://cdn-images.dzcdn.net/images/artist//1000x1000-000000-80-0-0.jpg"


class TestArtistPhoto:
    def test_search_includes_the_photo_in_the_biggest_size_available(self):
        body = {"data": [{"id": 1, "name": "A", "picture_xl": PHOTO, "picture_big": "https://x/big.jpg"}]}
        with _patch_get(_response(body)):
            assert search_artists("A")[0]["picture"] == PHOTO

    def test_it_falls_back_to_a_smaller_size(self):
        body = {"data": [{"id": 1, "name": "A", "picture_big": "https://cdn/images/artist/abc/500x500.jpg"}]}
        with _patch_get(_response(body)):
            assert search_artists("A")[0]["picture"] == "https://cdn/images/artist/abc/500x500.jpg"

    def test_the_placeholder_of_an_artist_without_photo_is_not_a_photo(self):
        body = {"data": [{"id": 1, "name": "A", "picture_xl": PLACEHOLDER, "picture_big": PLACEHOLDER}]}
        with _patch_get(_response(body)):
            assert search_artists("A")[0]["picture"] == ""

    def test_get_artist_returns_its_photo(self):
        with _patch_get(_response({"id": 4347, "name": "Jorge Drexler", "picture_xl": PHOTO})) as get:
            assert get_artist(4347) == {"id": 4347, "name": "Jorge Drexler", "picture": PHOTO}
        assert get.call_args.args[0] == "https://api.deezer.com/artist/4347"

    def test_get_artist_without_photo_or_not_found(self):
        with _patch_get(_response({"id": 1, "name": "A", "picture_xl": PLACEHOLDER})):
            assert get_artist(1)["picture"] == ""
        with _patch_get(_response({"error": {"type": "DataException", "code": 800, "message": "no data"}})):
            with pytest.raises(DeezerNotFound):
                get_artist(2)

    def test_only_https_urls_are_accepted(self):
        body = {"data": [{"id": 1, "name": "A", "picture_xl": "javascript:alert(1)", "picture_big": "http://insecure/x.jpg"}]}
        with _patch_get(_response(body)):
            assert search_artists("A")[0]["picture"] == ""


class TestGetArtistReleases:
    def test_follows_pagination_until_the_end(self):
        page1 = {"data": [{"id": 1, "title": "Uno", "record_type": "album", "release_date": "2001-05-01"}],
                 "next": "https://api.deezer.com/artist/9/albums?index=100"}
        page2 = {"data": [{"id": 2, "title": "Dos", "record_type": "single", "release_date": "2020-01-01"}]}
        with _patch_get(_response(page1), _response(page2)) as get:
            result = get_artist_releases(9)

        assert [r["id"] for r in result] == [1, 2]
        assert result[1] == {"id": 2, "title": "Dos", "record_type": "single", "release_date": "2020-01-01"}
        assert get.call_args_list[1].kwargs["params"]["index"] == 100


class TestGetAlbum:
    ALBUM = {
        "id": 7, "title": "Eco", "record_type": "album", "release_date": "2004-09-14", "nb_tracks": 2,
        "cover_xl": "https://cdn/eco-1000.jpg", "cover_big": "https://cdn/eco-500.jpg",
        "genres": {"data": [{"name": "Pop latino"}, {"name": "Rock"}]},
        "tracks": {"data": [
            {"id": 100, "title": "Al otro lado del río", "duration": 211},
            {"id": 101, "title": "Eco", "duration": 0},
        ]},
    }

    def test_normalizes_year_genre_cover_and_tracks(self):
        with _patch_get(_response(self.ALBUM)):
            album = get_album(7)

        assert album["year"] == 2004
        assert album["genre"] == "Pop latino"
        assert album["cover_url"] == "https://cdn/eco-1000.jpg"
        assert album["tracks"] == [
            {"id": 100, "title": "Al otro lado del río", "duration_seconds": 211},
            {"id": 101, "title": "Eco", "duration_seconds": None},
        ]

    @pytest.mark.parametrize("date", ["0000-00-00", "", None, "abcd-01-01"])
    def test_invalid_dates_give_no_year(self, date):
        with _patch_get(_response({**self.ALBUM, "release_date": date})):
            assert get_album(7)["year"] is None

    def test_album_without_genres_or_cover(self):
        body = {**self.ALBUM, "genres": {"data": []}, "cover_xl": None, "cover_big": None}
        with _patch_get(_response(body)):
            album = get_album(7)

        assert album["genre"] == ""
        assert album["cover_url"] == ""

    def test_fetches_the_rest_of_the_tracks_when_the_album_embeds_only_some(self):
        embedded = {**self.ALBUM, "nb_tracks": 3}
        rest = {"data": [{"id": 100, "title": "A", "duration": 1}, {"id": 101, "title": "B", "duration": 2},
                         {"id": 102, "title": "C", "duration": 3}]}
        with _patch_get(_response(embedded), _response(rest)) as get:
            album = get_album(7)

        assert [t["id"] for t in album["tracks"]] == [100, 101, 102]
        assert get.call_args_list[1].args[0] == "https://api.deezer.com/album/7/tracks"


class TestErrors:
    def test_not_found_error_body_raises_deezer_not_found(self):
        body = {"error": {"type": "DataException", "message": "no data", "code": 800}}
        with _patch_get(_response(body)):
            with pytest.raises(DeezerNotFound):
                get_album(1)

    def test_quota_error_is_retried_with_waiting_and_then_succeeds(self, no_waiting):
        quota = {"error": {"type": "Exception", "message": "Quota limit exceeded", "code": 4}}
        with _patch_get(_response(quota), _response(quota), _response({"data": []})) as get:
            assert search_artists("x") == []

        assert get.call_count == 3
        assert no_waiting.call_count == 2

    def test_http_5xx_and_429_are_retried(self):
        with _patch_get(_response({}, 503), _response({}, 429), _response({"data": []})) as get:
            assert search_artists("x") == []

        assert get.call_count == 3

    def test_network_errors_are_retried(self):
        with _patch_get(requests.ConnectionError("caído"), requests.Timeout("lento"), _response({"data": []})) as get:
            assert search_artists("x") == []

        assert get.call_count == 3

    def test_gives_up_after_a_few_attempts_with_a_clear_error(self):
        with _patch_get(*[_response({}, 503) for _ in range(deezer.MAX_ATTEMPTS)]) as get:
            with pytest.raises(DeezerError):
                search_artists("x")

        assert get.call_count == deezer.MAX_ATTEMPTS

    def test_unknown_error_body_is_not_retried(self):
        body = {"error": {"type": "OAuthException", "message": "nope", "code": 300}}
        with _patch_get(_response(body)) as get:
            with pytest.raises(DeezerError):
                search_artists("x")

        assert get.call_count == 1

    def test_non_json_response_is_an_error_not_a_crash(self):
        bad = _response(None)
        bad.json.side_effect = ValueError("no json")
        with _patch_get(*[bad for _ in range(deezer.MAX_ATTEMPTS)]):
            with pytest.raises(DeezerError):
                search_artists("x")
