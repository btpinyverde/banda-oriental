"""The music archive API: search and browse artists, albums and songs. Public, read-only."""

from datetime import timedelta

import pytest
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong

BASE = "/api/catalog"


@pytest.fixture
def data(db):
    drexler = Artist.objects.create(mbid="a-drexler", name="Jorge Drexler")
    traidores = Artist.objects.create(mbid="a-traidores", name="Los Traidores")
    zitarrosa = Artist.objects.create(mbid="a-zitarrosa", name="Alfredo Zitarrosa")
    Artist.objects.create(mbid="a-empty", name="Sin Canciones")  # an artist with nothing to show stays out
    vaiven = Album.objects.create(mbid="al-vaiven", name="Vaivén", artist=drexler, year=1996, genre="Folk")
    eco = Album.objects.create(mbid="al-eco", name="Eco", artist=drexler, year=2004, genre="Pop")
    noches = Album.objects.create(mbid="al-noches", name="Noches", artist=traidores, year=1988, genre="Rock")
    canta = Album.objects.create(mbid="al-canta", name="Canta Zitarrosa", artist=zitarrosa, year=1966, genre="Folklore", release_type="album")
    s = {}
    s["luna_drexler"] = Song.objects.create(mbid="s1", title="Luna negra", album=vaiven, duration_seconds=225)
    s["luna_traidores"] = Song.objects.create(mbid="s2", title="Luna negra", album=noches, duration_seconds=190)
    s["luna_eco"] = Song.objects.create(mbid="s3", title="Luna negra", album=eco, duration_seconds=251)
    s["milonga"] = Song.objects.create(mbid="s4", title="Milonga para una niña", album=vaiven)
    s["ausenta"] = Song.objects.create(mbid="s5", title="Del que se ausenta", album=canta)
    s["guitarra"] = Song.objects.create(mbid="s6", title="Guitarra negra", album=canta)
    s["simbolos"] = Song.objects.create(mbid="s7", title="- ...", album=canta)  # unreadable title: not for the archive
    s["drexler"], s["traidores"], s["zitarrosa"] = drexler, traidores, zitarrosa
    s["vaiven"], s["eco"], s["noches"], s["canta"] = vaiven, eco, noches, canta
    return s


def get(client, path, **params):
    return client.get(f"{BASE}{path}", params)


def titles(response):
    return [row["title"] for row in response.json()["results"]]


class TestSearch:
    def test_it_finds_songs_artists_and_albums_in_one_go(self, client, data):
        body = get(client, "/search/", q="drexler").json()

        assert [a["name"] for a in body["artists"]["results"]] == ["Jorge Drexler"]
        assert body["songs"]["total"] >= 3  # the songs of that artist match through it
        assert body["albums"]["total"] == 2

    def test_every_song_comes_with_enough_to_tell_it_apart(self, client, data):
        body = get(client, "/search/", q="luna negra").json()

        songs = body["songs"]["results"]
        assert len(songs) == 3 and body["songs"]["total"] == 3
        assert {(s["artist"]["name"], s["album"]["name"], s["album"]["year"]) for s in songs} == {
            ("Jorge Drexler", "Vaivén", 1996),
            ("Los Traidores", "Noches", 1988),
            ("Jorge Drexler", "Eco", 2004),
        }
        assert all({"id", "title", "duration_seconds"} <= set(s) for s in songs)

    def test_several_words_in_any_order_narrow_it_down_across_title_artist_and_record(self, client, data):
        assert get(client, "/search/", q="luna negra drexler").json()["songs"]["total"] == 2
        assert get(client, "/search/", q="drexler luna").json()["songs"]["total"] == 2
        assert get(client, "/search/", q="luna negra vaiven").json()["songs"]["total"] == 1

    def test_accents_and_case_do_not_matter(self, client, data):
        assert get(client, "/search/", q="VAIVEN").json()["albums"]["total"] == 1
        assert get(client, "/search/", q="vaivén").json()["albums"]["total"] == 1
        assert get(client, "/search/", q="milonga para una nina").json()["songs"]["total"] == 1

    def test_the_exact_title_comes_before_the_ones_that_only_contain_it(self, client, data):
        Song.objects.create(mbid="s8", title="Luna negra de ayer", album=data["vaiven"])
        Song.objects.create(mbid="s9", title="La luna negra", album=data["vaiven"])

        found = [s["title"] for s in get(client, "/search/", q="luna negra").json()["songs"]["results"]]

        assert found[:3] == ["Luna negra"] * 3
        assert found[3] == "Luna negra de ayer"  # starts with it, before the one that merely contains it
        assert found[4] == "La luna negra"

    def test_each_group_is_limited_and_says_how_many_there_are_in_total(self, client, data):
        body = get(client, "/search/", q="luna negra", limit=2).json()

        assert len(body["songs"]["results"]) == 2
        assert body["songs"]["total"] == 3

    @pytest.mark.parametrize("params", [{}, {"q": ""}, {"q": "   "}, {"q": "x" * 101}, {"q": "luna", "limit": "0"}, {"q": "luna", "limit": "abc"}, {"q": "luna", "limit": "99"}])
    def test_it_asks_for_something_reasonable(self, client, data, params):
        response = client.get(f"{BASE}/search/", params)

        assert response.status_code == 400
        assert response.json()["detail"]

    def test_a_search_with_no_results_is_an_empty_answer_not_an_error(self, client, data):
        body = get(client, "/search/", q="zzzzzz").json()

        assert body["songs"] == {"results": [], "total": 0}
        assert body["artists"]["total"] == 0 and body["albums"]["total"] == 0

    def test_characters_that_mean_something_to_a_database_are_just_text(self, client, data):
        for q in ["%", "_", "'; drop table catalog_song; --", "\\", "a%b"]:
            assert get(client, "/search/", q=q).status_code == 200
        assert Song.objects.count() == 7


class TestArtists:
    def test_the_list_has_each_artist_with_what_they_have_and_hides_the_ones_with_no_songs(self, client, data):
        body = get(client, "/artists/").json()

        names = [a["name"] for a in body["results"]]
        assert names == ["Alfredo Zitarrosa", "Jorge Drexler", "Los Traidores"]
        drexler = next(a for a in body["results"] if a["name"] == "Jorge Drexler")
        assert drexler["albums"] == 2 and drexler["songs"] == 3
        assert drexler["first_year"] == 1996 and drexler["last_year"] == 2004

    def test_it_is_paginated_and_says_how_many_pages_there_are(self, client, data):
        body = get(client, "/artists/", page_size=2).json()

        assert body["count"] == 3 and body["page"] == 1 and body["pages"] == 2 and len(body["results"]) == 2
        second = get(client, "/artists/", page_size=2, page=2).json()
        assert [a["name"] for a in second["results"]] == ["Los Traidores"]

    def test_a_page_past_the_end_is_empty_not_an_error(self, client, data):
        body = get(client, "/artists/", page=99).json()

        assert body["results"] == [] and body["count"] == 3

    def test_it_filters_by_search_and_by_first_letter(self, client, data):
        assert [a["name"] for a in get(client, "/artists/", q="trai").json()["results"]] == ["Los Traidores"]
        assert [a["name"] for a in get(client, "/artists/", letter="j").json()["results"]] == ["Jorge Drexler"]
        assert [a["name"] for a in get(client, "/artists/", letter="L").json()["results"]] == ["Los Traidores"]

    def test_the_detail_has_the_albums_in_order_of_year(self, client, data):
        body = client.get(f"{BASE}/artists/{data['drexler'].id}/").json()

        assert body["name"] == "Jorge Drexler" and body["songs"] == 3
        assert [(a["name"], a["year"], a["songs"]) for a in body["albums"]] == [("Vaivén", 1996, 2), ("Eco", 2004, 1)]

    def test_an_unknown_artist_is_a_404_with_a_message(self, client, data):
        response = client.get(f"{BASE}/artists/999999/")

        assert response.status_code == 404 and response.json()["detail"]


class TestAlbums:
    def test_the_list_shows_who_made_it_when_and_how_many_songs(self, client, data):
        body = get(client, "/albums/").json()

        vaiven = next(a for a in body["results"] if a["name"] == "Vaivén")
        assert vaiven["artist"] == {"id": data["drexler"].id, "name": "Jorge Drexler"}
        assert vaiven["year"] == 1996 and vaiven["genre"] == "Folk" and vaiven["songs"] == 2

    def test_it_filters_by_year_decade_genre_artist_and_search(self, client, data):
        names = lambda **p: sorted(a["name"] for a in get(client, "/albums/", **p).json()["results"])  # noqa: E731

        assert names(year=1996) == ["Vaivén"]
        assert names(decade=1990) == ["Vaivén"]
        assert names(decade=2000) == ["Eco"]
        assert names(genre="folklore") == ["Canta Zitarrosa"]
        assert names(genre="FOLK") == ["Vaivén"]  # the genre, not a part of it, and not by case
        assert names(artist=data["drexler"].id) == ["Eco", "Vaivén"]
        assert names(q="noche") == ["Noches"]

    def test_it_sorts_by_year_or_by_name(self, client, data):
        by_year = [a["year"] for a in get(client, "/albums/", sort="year").json()["results"]]
        by_name = [a["name"] for a in get(client, "/albums/", sort="name").json()["results"]]

        assert by_year == sorted(by_year)
        assert by_name == sorted(by_name)
        assert get(client, "/albums/", sort="inventado").status_code == 400

    def test_the_detail_lists_its_songs_with_their_length(self, client, data):
        body = client.get(f"{BASE}/albums/{data['vaiven'].id}/").json()

        assert body["name"] == "Vaivén" and body["artist"]["name"] == "Jorge Drexler"
        assert [s["title"] for s in body["songs"]] == ["Luna negra", "Milonga para una niña"]
        assert body["songs"][0]["duration_seconds"] == 225

    def test_a_filter_that_is_not_a_number_is_a_clear_400_not_a_crash(self, client, data):
        for param in ("year", "decade", "artist", "page", "page_size"):
            response = get(client, "/albums/", **{param: "abc"})
            assert response.status_code == 400 and response.json()["detail"], param


class TestSongs:
    def test_the_list_never_includes_titles_made_only_of_symbols(self, client, data):
        assert "- ..." not in titles(get(client, "/songs/", page_size=50))

    def test_each_song_has_its_artist_and_record_so_equal_titles_can_be_told_apart(self, client, data):
        body = get(client, "/songs/", q="luna negra").json()

        assert body["count"] == 3
        assert {(s["artist"]["name"], s["album"]["name"]) for s in body["results"]} == {
            ("Jorge Drexler", "Vaivén"), ("Los Traidores", "Noches"), ("Jorge Drexler", "Eco")
        }

    def test_it_filters_by_artist_album_decade_and_genre(self, client, data):
        found = lambda **p: sorted(titles(get(client, "/songs/", **p)))  # noqa: E731

        assert found(artist=data["traidores"].id) == ["Luna negra"]
        assert found(album=data["vaiven"].id) == ["Luna negra", "Milonga para una niña"]
        assert found(decade=1960) == ["Del que se ausenta", "Guitarra negra"]
        assert found(genre="rock") == ["Luna negra"]

    def test_search_works_on_title_artist_and_record_together(self, client, data):
        assert sorted(titles(get(client, "/songs/", q="zitarrosa negra"))) == ["Guitarra negra"]

    def test_it_says_on_which_day_a_song_was_the_one_of_the_day_but_only_for_days_already_over(self, client, data):
        today = timezone.localdate()
        DailySong.objects.create(date=today - timedelta(days=1), song=data["ausenta"], state=DailySong.PUBLISHED)
        DailySong.objects.create(date=today, song=data["guitarra"], state=DailySong.PUBLISHED)
        DailySong.objects.create(date=today + timedelta(days=1), song=data["milonga"], state=DailySong.PUBLISHED)

        rows = {s["title"]: s for s in get(client, "/songs/", page_size=50).json()["results"]}

        assert rows["Del que se ausenta"]["played_on"] == str(today - timedelta(days=1))
        assert rows["Guitarra negra"]["played_on"] is None  # today's is not given away
        assert rows["Milonga para una niña"]["played_on"] is None  # neither is tomorrow's
        assert rows["Luna negra"]["played_on"] is None

    def test_the_detail_has_everything_and_never_gives_away_today_nor_a_draft(self, client, data):
        today = timezone.localdate()
        DailySong.objects.create(date=today - timedelta(days=3), song=data["luna_drexler"], state=DailySong.PUBLISHED)
        DailySong.objects.create(date=today - timedelta(days=2), song=data["luna_drexler"], state=DailySong.DRAFT)
        DailySong.objects.create(date=today, song=data["luna_drexler"], state=DailySong.PUBLISHED)

        body = client.get(f"{BASE}/songs/{data['luna_drexler'].id}/").json()

        assert body["title"] == "Luna negra" and body["duration_seconds"] == 225
        assert body["artist"]["name"] == "Jorge Drexler" and body["album"]["year"] == 1996
        assert body["played_on"] == [str(today - timedelta(days=3))]

    def test_an_unknown_song_is_a_404(self, client, data):
        assert client.get(f"{BASE}/songs/999999/").status_code == 404

    def test_a_list_does_not_make_a_query_per_row(self, client, data, django_assert_max_num_queries):
        with django_assert_max_num_queries(6):
            assert get(client, "/songs/", page_size=50).status_code == 200


class TestFilters:
    def test_it_lists_what_the_interface_can_filter_by_with_how_many_each_has(self, client, data):
        body = client.get(f"{BASE}/filters/").json()

        assert {"decade": 1990, "albums": 1} in body["decades"]
        assert {"decade": 1960, "albums": 1} in body["decades"]
        assert {"genre": "Folk", "albums": 1} in body["genres"]
        assert body["years"] == {"min": 1966, "max": 2004}
        assert [d["decade"] for d in body["decades"]] == sorted(d["decade"] for d in body["decades"])

    def test_it_ignores_albums_with_no_genre_and_no_year(self, client, data):
        Album.objects.create(mbid="al-x", name="Sin datos", artist=data["drexler"])
        Song.objects.create(mbid="s-x", title="Una", album=Album.objects.get(mbid="al-x"))

        body = client.get(f"{BASE}/filters/").json()

        assert all(g["genre"] for g in body["genres"])
        assert all(d["decade"] for d in body["decades"])


class TestInGeneral:
    def test_nothing_needs_a_login_and_it_can_be_cached_for_a_minute(self, client, data):
        response = get(client, "/search/", q="luna")

        assert response.status_code == 200
        assert "max-age=60" in response["Cache-Control"] and "public" in response["Cache-Control"]

    def test_it_is_read_only(self, client, data):
        for path in ("/search/?q=luna", "/artists/", "/albums/", "/songs/"):
            assert client.post(f"{BASE}{path}", {}).status_code == 405

    def test_it_has_its_own_rate_limit(self):
        from django.conf import settings

        assert "catalog" in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
