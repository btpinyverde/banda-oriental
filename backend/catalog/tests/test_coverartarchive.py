from unittest.mock import MagicMock, patch

import requests

from catalog.coverartarchive import get_cover_art_url

COVER_ART_RESPONSE = {
    "images": [
        {
            "front": True,
            "image": "https://coverartarchive.org/release/9e80a911/full.jpg",
            "thumbnails": {
                "250": "https://coverartarchive.org/release/9e80a911/full-250.jpg",
                "500": "https://coverartarchive.org/release/9e80a911/full-500.jpg",
            },
        }
    ],
    "release": "https://musicbrainz.org/release/9e80a911-a74a-4290-aa8a-159fb97351ad",
}

COVER_ART_RESPONSE_NO_FRONT = {
    "images": [
        {
            "front": False,
            "back": True,
            "image": "https://coverartarchive.org/release/x/full.jpg",
            "thumbnails": {"500": "https://coverartarchive.org/release/x/back-500.jpg"},
        }
    ],
    "release": "https://musicbrainz.org/release/x",
}


@patch("catalog.coverartarchive.requests.get")
def test_get_cover_art_url_returns_500px_front_thumbnail(mock_get):
    response = MagicMock()
    response.json.return_value = COVER_ART_RESPONSE
    response.raise_for_status.return_value = None
    mock_get.return_value = response

    url = get_cover_art_url("9e80a911-a74a-4290-aa8a-159fb97351ad")

    assert url == "https://coverartarchive.org/release/9e80a911/full-500.jpg"


@patch("catalog.coverartarchive.requests.get")
def test_get_cover_art_url_returns_empty_string_when_no_front_image(mock_get):
    response = MagicMock()
    response.json.return_value = COVER_ART_RESPONSE_NO_FRONT
    response.raise_for_status.return_value = None
    mock_get.return_value = response

    assert get_cover_art_url("x") == ""


@patch("catalog.coverartarchive.requests.get")
def test_get_cover_art_url_returns_empty_string_on_404(mock_get):
    response = MagicMock()
    response.raise_for_status.side_effect = requests.HTTPError(response=MagicMock(status_code=404))
    mock_get.return_value = response

    assert get_cover_art_url("no-art-mbid") == ""


@patch("catalog.coverartarchive.requests.get")
def test_get_cover_art_url_returns_empty_string_on_timeout(mock_get):
    # Real failure mode: Cover Art Archive redirects to archive.org, which
    # is occasionally slow/unreachable. A timeout there must not crash the
    # whole sync — it should be treated the same as "no cover art".
    mock_get.side_effect = requests.Timeout("archive.org took too long")

    assert get_cover_art_url("slow-mbid") == ""
