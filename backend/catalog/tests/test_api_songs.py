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


# --- La lista completa pesaba ~9 MB con el catálogo de verdad y armarla con objetos del ORM llevaba el servidor (512 MB) al límite de
# memoria: cada visitante nuevo podía reiniciarlo. Ahora se arma con una sola consulta liviana, se guarda comprimida y se sirve con gzip.


@pytest.mark.django_db
def test_it_is_built_with_a_single_light_query(client, django_assert_num_queries):
    _song("s1", "Uno")
    _song("s2", "Dos", artist_name="Rubén Rada", album_name="Candombe")

    with django_assert_num_queries(1):
        response = client.get(reverse("catalog:songs"))

    assert len(response.json()["songs"]) == 2


@pytest.mark.django_db
def test_the_second_request_does_not_touch_the_database(client, django_assert_num_queries):
    _song("s1", "Uno")
    client.get(reverse("catalog:songs"))

    with django_assert_num_queries(0):
        response = client.get(reverse("catalog:songs"))

    assert response.status_code == 200 and len(response.json()["songs"]) == 1


@pytest.mark.django_db
def test_it_is_sent_compressed_to_whoever_accepts_gzip_and_the_content_is_the_same(client):
    import gzip

    _song("s1", "Uno")
    _song("s2", "Dos")
    plain = client.get(reverse("catalog:songs"))

    zipped = client.get(reverse("catalog:songs"), HTTP_ACCEPT_ENCODING="gzip, deflate, br")

    assert zipped["Content-Encoding"] == "gzip"
    assert "Accept-Encoding" in zipped["Vary"]
    assert zipped["Content-Type"] == "application/json"
    assert zipped["Cache-Control"].startswith("public, max-age=")
    assert gzip.decompress(zipped.content) == plain.content
    assert "Content-Encoding" not in plain  # without gzip support the answer goes as plain JSON


@pytest.mark.django_db
def test_a_symbol_only_title_and_hidden_songs_stay_out(client):
    _song("s1", "Real")
    _song("s2", "- ...")
    hidden = _song("s3", "Oculta")
    Song.objects.filter(pk=hidden.pk).update(hidden=True)

    titles = [s["title"] for s in client.get(reverse("catalog:songs")).json()["songs"]]

    assert titles == ["Real"]


@pytest.mark.django_db
def test_a_new_song_shows_up_after_the_cache_is_cleared_by_the_signal(client):
    _song("s1", "Uno")
    assert len(client.get(reverse("catalog:songs")).json()["songs"]) == 1

    _song("s2", "Dos")

    assert len(client.get(reverse("catalog:songs")).json()["songs"]) == 2


# --- Buscar en el servidor, de a páginas: nadie baja el catálogo entero. `GET /api/songs/?q=...&page=...` (sin `q` ni `page` sigue la lista
# completa, solo para el front viejo mientras se actualiza).


def _search(client, q, **extra):
    return client.get(reverse("catalog:songs"), {"q": q, **extra})


@pytest.mark.django_db
class TestSearch:
    def test_it_finds_by_title_artist_or_record_ignoring_accents_and_case(self, client):
        _song("s1", "Al otro lado del río", artist_name="Jorge Drexler", album_name="Eco")
        _song("s2", "Zafar", artist_name="La Vela Puerca", album_name="A contraluz")

        assert [s["title"] for s in _search(client, "RIO").json()["results"]] == ["Al otro lado del río"]
        assert [s["title"] for s in _search(client, "vela puerca").json()["results"]] == ["Zafar"]
        assert [s["title"] for s in _search(client, "contraluz").json()["results"]] == ["Zafar"]

    def test_several_words_must_all_match_in_any_order(self, client):
        _song("s1", "Luna negra", artist_name="Jorge Drexler")
        _song("s2", "Luna negra", artist_name="Los Traidores", album_name="Noches")

        assert [s["artist"] for s in _search(client, "negra drexler").json()["results"]] == ["Jorge Drexler"]

    def test_the_answer_has_what_the_guess_table_needs(self, client):
        song = _song("s1", "Eco del mar", year=2004, genre="Pop")

        result = _search(client, "eco").json()["results"][0]

        assert result == {"id": song.id, "title": "Eco del mar", "artist": "Jorge Drexler", "album": "Eco", "year": 2004, "genre": "Pop"}

    def test_hidden_songs_and_titles_made_of_symbols_never_show_up(self, client):
        _song("s1", "Luna real")
        _song("s2", "- ...", artist_name="Luna Band", album_name="Otro")  # matches by artist, but its title is only symbols
        hidden = _song("s3", "Luna oculta")
        Song.objects.filter(pk=hidden.pk).update(hidden=True)

        assert [s["title"] for s in _search(client, "luna").json()["results"]] == ["Luna real"]

    def test_what_starts_like_the_search_comes_first(self, client):
        _song("s1", "El mar de la luna", artist_name="Zeta")
        _song("s2", "Luna llena", artist_name="Beta")
        _song("s3", "Luna", artist_name="Alfa")

        titles = [s["title"] for s in _search(client, "luna").json()["results"]]

        assert titles == ["Luna", "Luna llena", "El mar de la luna"]

    def test_it_is_paged_and_says_whether_there_is_more_without_counting_everything(self, client, django_assert_max_num_queries):
        for i in range(45):
            _song(f"s{i}", f"Canción {i:02d}")

        with django_assert_max_num_queries(2):
            first = _search(client, "canción", page_size=20).json()
        second = _search(client, "canción", page=2, page_size=20).json()
        third = _search(client, "canción", page=3, page_size=20).json()

        assert (len(first["results"]), first["has_more"], first["page"]) == (20, True, 1)
        assert (len(second["results"]), second["has_more"]) == (20, True)
        assert (len(third["results"]), third["has_more"]) == (5, False)
        ids = [s["id"] for page in (first, second, third) for s in page["results"]]
        assert len(ids) == len(set(ids)) == 45  # nothing repeated, nothing missing

    def test_a_search_that_is_too_short_or_empty_finds_nothing_instead_of_everything(self, client):
        _song("s1", "Luna")

        for q in ("", " ", "l"):
            assert _search(client, q).json() == {"results": [], "has_more": False, "page": 1}

    @pytest.mark.parametrize("params", [{"page": "0"}, {"page": "abc"}, {"page": "9999"}, {"page_size": "0"}, {"page_size": "500"}])
    def test_bad_paging_is_a_clear_error(self, client, params):
        assert _search(client, "luna", **params).status_code == 400

    def test_a_very_long_search_is_rejected(self, client):
        assert _search(client, "x" * 200).status_code == 400

    def test_the_answer_can_be_cached_for_a_minute(self, client):
        assert _search(client, "luna")["Cache-Control"] == "public, max-age=60"

    def test_the_full_list_is_still_there_for_the_old_front_when_no_search_or_page_is_asked(self, client):
        _song("s1", "Uno")

        assert len(client.get(reverse("catalog:songs")).json()["songs"]) == 1

    def test_searching_has_its_own_limit_apart_from_the_global_one(self):
        from catalog.views import SongListView

        view = SongListView()
        view.request = type("R", (), {"query_params": {"q": "luna"}})()
        assert (view.throttle_scope, view.skip_global_throttle) == ("song-search", True)
        view.request = type("R", (), {"query_params": {}})()
        assert (view.throttle_scope, view.skip_global_throttle) == ("songs", False)
