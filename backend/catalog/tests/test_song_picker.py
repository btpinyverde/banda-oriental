"""Choosing the song of a day in the admin: the title alone is not enough (many artists have a "Luna negra", and one
artist can have it on more than one record), so the picker shows who, which record, which year and how long, and finds
songs by any of those."""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from catalog.admin import SongAdmin
from catalog.models import Album, Artist, Song
from gameplay.models import DailySong

User = get_user_model()


def make_song(title, artist, album, year, seconds=None, mbid=None):
    artist_row, _ = Artist.objects.get_or_create(mbid=f"artist-{artist}", defaults={"name": artist})
    album_row, _ = Album.objects.get_or_create(
        mbid=f"album-{artist}-{album}-{year}", defaults={"name": album, "artist": artist_row, "year": year}
    )
    return Song.objects.create(mbid=mbid or f"song-{title}-{artist}-{album}-{year}", title=title, album=album_row, duration_seconds=seconds)


@pytest.fixture
def songs(db):
    return {
        "drexler": make_song("Luna negra", "Jorge Drexler", "Vaivén", 1996, 225),
        "drexler_live": make_song("Luna negra", "Jorge Drexler", "Live in Montevideo", 2003, 251),
        "other": make_song("Luna negra", "Los Traidores", "Noches", 1988, 190),
        "different": make_song("Milonga para una niña", "Jorge Drexler", "Vaivén", 1996),
    }


@pytest.fixture
def staff(client, db):
    client.force_login(User.objects.create_superuser(username="admin@example.com", email="admin@example.com", password="pw"))
    return client


def search(client, term):
    response = client.get(
        reverse("admin:autocomplete"),
        {"term": term, "app_label": "gameplay", "model_name": "dailysong", "field_name": "song"},
    )
    assert response.status_code == 200
    return [row["text"] for row in response.json()["results"]]


class TestHowASongIsShown:
    def test_it_says_who_which_record_which_year_and_how_long(self, songs):
        text = str(songs["drexler"])

        assert text == "Luna negra — Jorge Drexler · Vaivén (1996) · 3:45"

    def test_the_same_title_by_the_same_artist_on_two_records_reads_differently(self, songs):
        assert str(songs["drexler"]) != str(songs["drexler_live"])

    def test_what_is_missing_is_left_out_instead_of_shown_as_none(self, db):
        song = make_song("Sin datos", "Alguien", "Disco", None)

        assert str(song) == "Sin datos — Alguien · Disco"
        assert "None" not in str(song)


class TestFindingASong:
    def test_the_title_alone_finds_every_song_with_it_and_tells_them_apart(self, staff, songs):
        found = search(staff, "luna negra")

        assert len(found) == 3
        assert len(set(found)) == 3
        assert "Luna negra — Los Traidores · Noches (1988) · 3:10" in found

    def test_adding_the_artist_narrows_it_down(self, staff, songs):
        found = search(staff, "luna negra drexler")

        assert sorted(found) == sorted([str(songs["drexler"]), str(songs["drexler_live"])])

    def test_adding_the_record_narrows_it_to_one(self, staff, songs):
        assert search(staff, "luna negra vaivén") == [str(songs["drexler"])]

    def test_the_accent_and_the_case_do_not_matter(self, staff, songs):
        assert search(staff, "VAIVEN luna") == [str(songs["drexler"])]

    def test_it_also_finds_by_artist_or_by_record_alone(self, staff, songs):
        assert len(search(staff, "los traidores")) == 1
        assert len(search(staff, "noches")) == 1

    def test_the_results_come_in_a_steady_order(self, staff, songs):
        assert search(staff, "luna negra") == search(staff, "luna negra")
        assert search(staff, "luna negra")[0].startswith("Luna negra — Jorge Drexler")

    def test_searching_does_not_make_a_query_per_song(self, staff, songs, django_assert_max_num_queries):
        for n in range(15):
            make_song(f"Luna {n}", "Artista", f"Disco {n}", 2000 + n)

        with django_assert_max_num_queries(12):
            assert len(search(staff, "luna")) > 15


class TestTheAdminScreens:
    def test_the_day_form_picks_the_song_by_searching_not_from_a_list_of_every_song(self):
        from django.contrib import admin

        from gameplay.admin import DailySongAdmin

        assert "song" in DailySongAdmin(DailySong, admin.site).autocomplete_fields

    def test_the_song_list_shows_artist_record_year_and_how_many_times_it_was_used(self, staff, songs):
        DailySong.objects.create(date=timezone.localdate(), song=songs["drexler"])

        page = staff.get(reverse("admin:catalog_song_changelist")).content.decode()

        for text in ("Jorge Drexler", "Vaivén", "1996", "Live in Montevideo"):
            assert text in page
        assert "Veces usada" in page

    def test_the_song_list_can_be_searched_by_artist_and_record(self):
        from django.contrib import admin

        fields = SongAdmin(Song, admin.site).search_fields
        assert any("artist__name" in f for f in fields) and any("album__name" in f for f in fields)
