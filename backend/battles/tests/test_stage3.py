"""Stage 3: how the songs are chosen (segmented random or an ordered list, with YouTube links) and the helpers that build them."""
import pytest
from django.urls import reverse

from battles import youtube
from battles.models import Battle, BattlePlayer
from catalog.models import Album, Artist, Song

from .conftest import D2, HOST, STRANGER


@pytest.fixture(autouse=True)
def open_to_everybody(settings):
    settings.BATTLES = {**settings.BATTLES, "CREATOR_EMAILS": ["*"], "MIN_PLAYERS": 1}


@pytest.fixture
def catalog(db, monkeypatch):
    rock = Artist.objects.create(mbid="a1", name="La Vela Puerca")
    pop = Artist.objects.create(mbid="a2", name="Jorge Drexler")
    a_rock = Album.objects.create(mbid="al1", name="Rock", artist=rock, year=2001, genre="Rock", release_type="album")
    a_pop = Album.objects.create(mbid="al2", name="Pop", artist=pop, year=2010, genre="Pop", release_type="album")
    songs = [Song.objects.create(mbid=f"r{i}", title=f"Rock {i}", album=a_rock, duration_seconds=200, deezer_id=100 + i) for i in range(6)]
    songs += [Song.objects.create(mbid=f"p{i}", title=f"Pop {i}", album=a_pop, duration_seconds=200, deezer_id=200 + i) for i in range(6)]
    monkeypatch.setattr("battles.services.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    monkeypatch.setattr("battles.state.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    return songs


def create(client, expect=201, **body):
    r = client.post(reverse("battles:create"), data=body, content_type="application/json", HTTP_X_DEVICE_ID=HOST)
    assert r.status_code == expect, r.content
    return r.json()


def start(client, made):
    client.post(reverse("battles:join", args=[made["code"]]), data={"display_name": "Ana"}, content_type="application/json", HTTP_X_DEVICE_ID=D2)
    return client.post(reverse("battles:start", args=[made["code"]]), data={}, content_type="application/json", HTTP_X_DEVICE_ID=HOST, HTTP_X_HOST_TOKEN=made["host_token"])


# --- segmented random --------------------------------------------------------------------------------------------------

def test_the_filters_are_saved_cleaned_with_the_room(client, catalog):
    made = create(client, round_count=3, filters={"include": {"genres": [" Rock "], "year_from": 2000}})
    assert Battle.objects.get(code=made["code"]).filters == {"include": {"genres": ["Rock"], "year_from": 2000}, "exclude": {}}


def test_bad_filters_are_a_bad_request(client, catalog):
    create(client, expect=400, filters={"include": {"year_from": "x"}})
    create(client, expect=400, songs_mode="sorteo")


def test_random_rounds_stay_inside_the_segment(client, catalog):
    made = create(client, round_count=5, filters={"include": {"genres": ["rock"]}, "exclude": {"songs": [Song.objects.get(title="Rock 0").pk]}})
    assert start(client, made).status_code == 200
    titles = {r.song.title for r in Battle.objects.get(code=made["code"]).rounds.all()}
    assert titles == {"Rock 1", "Rock 2", "Rock 3", "Rock 4", "Rock 5"}


def test_excluding_leaves_the_rest(client, catalog):
    made = create(client, round_count=6, filters={"exclude": {"artists": [Artist.objects.get(name="La Vela Puerca").pk]}})
    assert start(client, made).status_code == 200
    assert all(r.song.title.startswith("Pop") for r in Battle.objects.get(code=made["code"]).rounds.all())


def test_a_segment_with_too_few_songs_says_so_and_does_not_start(client, catalog):
    made = create(client, round_count=8, filters={"include": {"genres": ["Pop"]}})
    r = start(client, made)
    assert r.status_code == 400 and "no hay suficientes canciones" in str(r.json()).lower()
    assert Battle.objects.get(code=made["code"]).status == Battle.LOBBY


# --- a list chosen by the organizer ------------------------------------------------------------------------------------

def item(song, **extra):
    return {"song_id": song.pk, "source": "deezer", **extra}


def test_a_list_keeps_its_order_and_sets_the_number_of_rounds(client, catalog):
    order = [catalog[7], catalog[1], catalog[4]]
    made = create(client, songs_mode="list", playlist=[item(s) for s in order])
    assert made["round_count"] == 3
    assert start(client, made).status_code == 200
    got = [r.song_id for r in Battle.objects.get(code=made["code"]).rounds.order_by("index")]
    assert got == [s.pk for s in order]


def test_a_youtube_item_keeps_its_video_and_start(client, catalog):
    made = create(client, songs_mode="list", playlist=[item(catalog[0], source="youtube", youtube_id="dQw4w9WgXcQ", start_seconds=12), item(catalog[1])])
    assert start(client, made).status_code == 200
    first, second = Battle.objects.get(code=made["code"]).rounds.order_by("index")
    assert (first.source, first.youtube_id, first.start_seconds) == ("youtube", "dQw4w9WgXcQ", 12)
    assert (second.source, second.youtube_id) == ("deezer", "")


@pytest.mark.parametrize(
    "playlist",
    [
        [],
        "x",
        [{"song_id": 999999, "source": "deezer"}],
        [{"source": "deezer"}],
        [{"song_id": 1, "source": "tiktok"}],
        [{"song_id": 1, "source": "youtube", "youtube_id": "corto"}],
        [{"song_id": 1, "source": "youtube"}],
        [{"song_id": 1, "source": "deezer", "start_seconds": -1}],
        [{"song_id": 1, "source": "youtube", "youtube_id": "dQw4w9WgXcQ", "start_seconds": 601}],
    ],
)
def test_bad_lists_are_a_bad_request(client, catalog, playlist):
    if isinstance(playlist, list):
        for entry in playlist:
            if entry.get("song_id") == 1:
                entry["song_id"] = catalog[0].pk
    create(client, expect=400, songs_mode="list", playlist=playlist)


def test_a_list_cannot_repeat_a_song_nor_use_hidden_ones(client, catalog):
    create(client, expect=400, songs_mode="list", playlist=[item(catalog[0]), item(catalog[0])])
    catalog[1].hidden = True
    catalog[1].save()
    create(client, expect=400, songs_mode="list", playlist=[item(catalog[1])])


def test_a_list_over_the_maximum_is_refused(client, catalog, settings):
    settings.BATTLES = {**settings.BATTLES, "MAX_ROUNDS": 2}
    create(client, expect=400, songs_mode="list", playlist=[item(s) for s in catalog[:3]])


def test_a_deezer_item_without_audio_stops_the_start_naming_the_song(client, catalog, monkeypatch):
    made = create(client, songs_mode="list", playlist=[item(catalog[0]), item(catalog[1])])
    monkeypatch.setattr("battles.services.preview_url", lambda s: None if s.pk == catalog[1].pk else "https://cdn/x.mp3")
    r = start(client, made)
    assert r.status_code == 400 and "Rock 1" in str(r.json())


def test_a_youtube_item_does_not_need_a_deezer_preview(client, catalog, monkeypatch):
    made = create(client, songs_mode="list", playlist=[item(catalog[0], source="youtube", youtube_id="dQw4w9WgXcQ")])
    monkeypatch.setattr("battles.services.preview_url", lambda s: None)
    assert start(client, made).status_code == 200


def test_the_room_lists_what_is_needed_to_play_a_youtube_round(client, catalog, clock):
    made = create(client, songs_mode="list", audio_mode="each", playlist=[item(catalog[0], source="youtube", youtube_id="dQw4w9WgXcQ", start_seconds=7)])
    start(client, made)
    clock(8)
    r = client.get(reverse("battles:detail", args=[made["code"]]), HTTP_X_DEVICE_ID=D2).json()["round"]
    assert (r["source"], r["youtube_id"], r["start_seconds"]) == ("youtube", "dQw4w9WgXcQ", 7)
    assert r["preview_url"].startswith("https://cdn/")  # the fallback when the video cannot be played
    host = client.get(reverse("battles:detail", args=[made["code"]]), HTTP_X_DEVICE_ID=HOST, HTTP_X_HOST_TOKEN=made["host_token"]).json()["round"]
    assert "youtube_id" not in host and "preview_url" not in host  # in "each" mode the organizer plays nothing


def test_in_host_mode_the_organizer_gets_the_video_and_the_players_do_not(client, catalog, clock):
    made = create(client, songs_mode="list", audio_mode="host", playlist=[item(catalog[0], source="youtube", youtube_id="dQw4w9WgXcQ")])
    start(client, made)
    clock(8)
    host = client.get(reverse("battles:detail", args=[made["code"]]), HTTP_X_DEVICE_ID=HOST, HTTP_X_HOST_TOKEN=made["host_token"]).json()["round"]
    assert host["youtube_id"] == "dQw4w9WgXcQ"
    player = client.get(reverse("battles:detail", args=[made["code"]]), HTTP_X_DEVICE_ID=D2).json()["round"]
    assert "youtube_id" not in player and "preview_url" not in player


# --- how many songs does a segment have? -------------------------------------------------------------------------------

def pool_count(client, device=HOST, **body):
    return client.post(reverse("battles:pool"), data=body, content_type="application/json", HTTP_X_DEVICE_ID=device)


def test_pool_counts_the_songs_of_a_segment(client, catalog):
    assert pool_count(client).json() == {"count": 12}
    assert pool_count(client, filters={"include": {"genres": ["Pop"]}}).json() == {"count": 6}
    assert pool_count(client, filters={"include": {"genres": ["Pop"]}, "exclude": {"songs": [catalog[6].pk]}}).json() == {"count": 5}


def test_pool_rejects_bad_filters_and_hides_from_who_cannot_create(client, catalog, settings):
    assert pool_count(client, filters={"include": {"year_from": 1}}).status_code == 400
    settings.BATTLES = {**settings.BATTLES, "CREATOR_EMAILS": ["otro@x.uy"]}
    assert pool_count(client).status_code == 404


# --- reading a YouTube link --------------------------------------------------------------------------------------------

@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://vimeo.com/123", None),
        ("https://evil.com/watch?v=dQw4w9WgXcQ", None),
        ("https://www.youtube.com/watch?v=corto", None),
        ("", None),
        (None, None),
    ],
)
def test_the_video_id_is_read_from_the_usual_links(url, expected):
    assert youtube.extract_video_id(url) == expected


class FakeResponse:
    def __init__(self, status, body=None):
        self.status_code, self._body = status, body or {}

    def json(self):
        return self._body


def lookup(client, url, device=HOST):
    return client.post(reverse("battles:youtube"), data={"url": url}, content_type="application/json", HTTP_X_DEVICE_ID=device)


def test_a_link_comes_back_with_its_title_and_the_catalog_songs_it_could_be(client, catalog, monkeypatch):
    monkeypatch.setattr(youtube.requests, "get", lambda *a, **k: FakeResponse(200, {"title": "La Vela Puerca - Rock 3 (Official Video)", "author_name": "LaVelaPuercaVEVO"}))
    r = lookup(client, "https://youtu.be/dQw4w9WgXcQ")
    assert r.status_code == 200
    data = r.json()
    assert data["youtube_id"] == "dQw4w9WgXcQ" and data["title"].startswith("La Vela Puerca")
    assert data["suggestions"][0]["title"] == "Rock 3" and data["suggestions"][0]["artist"] == "La Vela Puerca"


def test_a_link_with_no_match_still_comes_back_for_choosing_by_hand(client, catalog, monkeypatch):
    monkeypatch.setattr(youtube.requests, "get", lambda *a, **k: FakeResponse(200, {"title": "Algo que no está", "author_name": "Nadie"}))
    assert lookup(client, "https://youtu.be/dQw4w9WgXcQ").json()["suggestions"] == []


def test_a_video_that_does_not_allow_embedding_is_refused_with_a_clear_reason(client, catalog, monkeypatch):
    monkeypatch.setattr(youtube.requests, "get", lambda *a, **k: FakeResponse(401))
    r = lookup(client, "https://youtu.be/dQw4w9WgXcQ")
    assert r.status_code == 400 and "fuera de YouTube" in str(r.json())


@pytest.mark.parametrize("status", [400, 404])
def test_a_video_that_does_not_exist_says_so(client, catalog, monkeypatch, status):
    monkeypatch.setattr(youtube.requests, "get", lambda *a, **k: FakeResponse(status))
    r = lookup(client, "https://youtu.be/dQw4w9WgXcQ")
    assert r.status_code == 400 and "No encontramos ese video" in str(r.json())


def test_a_failing_youtube_is_refused(client, catalog, monkeypatch):
    monkeypatch.setattr(youtube.requests, "get", lambda *a, **k: FakeResponse(500))
    assert lookup(client, "https://youtu.be/dQw4w9WgXcQ").status_code == 400

    def boom(*a, **k):
        raise youtube.requests.RequestException("down")

    monkeypatch.setattr(youtube.requests, "get", boom)
    assert lookup(client, "https://youtu.be/dQw4w9WgXcQ").status_code == 400
    assert lookup(client, "no es un enlace").status_code == 400


def test_the_lookup_is_hidden_from_who_cannot_create(client, catalog, settings):
    settings.BATTLES = {**settings.BATTLES, "CREATOR_EMAILS": ["otro@x.uy"]}
    assert lookup(client, "https://youtu.be/dQw4w9WgXcQ").status_code == 404
