"""Cleaning the catalog without losing anything: what is a duplicate, classical or noise is HIDDEN (reversible), never
deleted, and the songs of days already played or scheduled are never touched. Dry run unless told otherwise."""

from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong


def run(*args):
    out = StringIO()
    call_command("clean_catalog", *args, stdout=out)
    return out.getvalue()


@pytest.fixture
def artist(db):
    return Artist.objects.create(mbid="a1", name="Jorge Drexler")


def album(artist, name, year=None, genre="", kind="album", mbid=None):
    return Album.objects.create(mbid=mbid or f"al-{name}-{year}", name=name, artist=artist, year=year, genre=genre, release_type=kind)


def song(album, title, seconds=None):
    return Song.objects.create(mbid=f"s-{album.mbid}-{title}", title=title, album=album, duration_seconds=seconds)


def hidden(*songs):
    return [Song.objects.get(pk=s.pk).hidden for s in songs]


class TestItNeedsToKnowWhatToDo:
    def test_without_a_task_it_explains_instead_of_doing_something(self, db):
        with pytest.raises(CommandError, match="duplicadas|clasica|generos"):
            run()


class TestDuplicates:
    def test_the_same_song_on_several_records_keeps_one_and_hides_the_rest_after_apply(self, artist):
        original = song(album(artist, "Vaivén", 1996), "Luna negra", 225)
        reissue = song(album(artist, "Vaivén (Deluxe Edition)", 2006, kind="album"), "Luna negra")
        single = song(album(artist, "Luna negra", 1996, kind="single"), "Luna negra", 225)

        run("--duplicadas", "--aplicar")

        assert hidden(original, reissue, single) == [False, True, True]
        assert Song.objects.get(pk=reissue.pk).hidden_reason == "duplicate"

    def test_it_prefers_the_full_record_the_earliest_year_and_the_one_with_data(self, artist):
        single = song(album(artist, "Sencillo", 1999, kind="single"), "Canción", 200)
        late_album = song(album(artist, "Disco tarde", 2010), "Canción", 200)
        early_album = song(album(artist, "Disco temprano", 2000), "Canción")

        run("--duplicadas", "--aplicar")

        assert hidden(early_album, late_album, single) == [False, True, True]

    def test_remastered_and_edition_suffixes_count_as_the_same_title(self, artist):
        a = song(album(artist, "Uno", 1990), "Milonga")
        b = song(album(artist, "Dos", 2000), "Milonga - Remastered 2004")
        c = song(album(artist, "Tres", 2001), "Milonga (Remasterizado 2010)")

        run("--duplicadas", "--aplicar")

        assert sorted(hidden(a, b, c)) == [False, True, True]

    def test_a_live_or_remix_version_is_a_different_song_and_stays(self, artist):
        studio = song(album(artist, "Uno", 1990), "Milonga")
        live = song(album(artist, "En vivo", 1995), "Milonga (En vivo)")

        run("--duplicadas", "--aplicar")

        assert hidden(studio, live) == [False, False]

    def test_songs_with_the_same_title_by_different_artists_are_not_duplicates(self, artist):
        other = Artist.objects.create(mbid="a2", name="Los Traidores")
        mine = song(album(artist, "A", 1990), "Luna negra")
        theirs = song(album(other, "B", 1988, mbid="b"), "Luna negra")

        run("--duplicadas", "--aplicar")

        assert hidden(mine, theirs) == [False, False]

    def test_the_song_of_a_day_already_played_or_coming_is_the_one_that_stays(self, artist):
        early = song(album(artist, "Temprano", 1990), "Canción", 200)
        chosen = song(album(artist, "Elegido", 2005), "Canción")
        DailySong.objects.create(date=timezone.localdate() + timedelta(days=3), song=chosen)

        run("--duplicadas", "--aplicar")

        assert hidden(early, chosen) == [True, False]  # even if the other one looked "better"

    def test_two_songs_used_on_different_days_are_both_kept(self, artist):
        a = song(album(artist, "Uno", 1990), "Canción")
        b = song(album(artist, "Dos", 2000), "Canción")
        DailySong.objects.create(date=timezone.localdate() - timedelta(days=5), song=a)
        DailySong.objects.create(date=timezone.localdate() - timedelta(days=4), song=b)

        run("--duplicadas", "--aplicar")

        assert hidden(a, b) == [False, False]


class TestClassical:
    def test_it_hides_the_songs_of_classical_albums_whatever_the_capitalization(self, artist):
        pop = song(album(artist, "Pop", 1990, genre="Pop"), "Una")
        classic = song(album(artist, "Sinfonía", 1990, genre="classical"), "Allegro")
        classic2 = song(album(artist, "Sonata", 1991, genre="Classical"), "Adagio")

        run("--clasica", "--aplicar")

        assert hidden(pop, classic, classic2) == [False, True, True]
        assert Song.objects.get(pk=classic.pk).hidden_reason == "classical"

    def test_it_never_hides_the_song_of_a_day(self, artist):
        classic = song(album(artist, "Sinfonía", 1990, genre="Classical"), "Allegro")
        DailySong.objects.create(date=timezone.localdate(), song=classic)

        run("--clasica", "--aplicar")

        assert hidden(classic) == [False]


class TestGenres:
    def test_it_unifies_the_same_genre_written_in_different_ways(self, artist):
        for i, g in enumerate(["Rock", "Rock", "rock", "ROCK", "Pop"]):
            song(album(artist, f"D{i}", 1990 + i, genre=g), f"T{i}")

        run("--generos", "--aplicar")

        assert set(Album.objects.values_list("genre", flat=True)) == {"Rock", "Pop"}

    def test_the_commonest_writing_wins(self, artist):
        for i, g in enumerate(["latin", "latin", "Latin"]):
            song(album(artist, f"D{i}", 1990 + i, genre=g), f"T{i}")

        run("--generos", "--aplicar")

        assert set(Album.objects.values_list("genre", flat=True)) == {"latin"}

    def test_a_record_with_no_genre_takes_the_one_its_artist_clearly_has_only_if_asked(self, artist):
        song(album(artist, "A", 1990, genre="Rock"), "t1")
        song(album(artist, "B", 1992, genre="Rock"), "t2")
        song(album(artist, "C", 1994, genre="Pop"), "t3")
        empty = album(artist, "Sin género", 1996)
        song(empty, "t4")

        run("--generos", "--aplicar")
        assert Album.objects.get(pk=empty.pk).genre == ""  # inferring is a separate, explicit step

        run("--generos", "--inferir-genero", "--aplicar")
        assert Album.objects.get(pk=empty.pk).genre == "Rock"

    def test_it_does_not_guess_when_the_artist_has_no_clear_genre(self, artist):
        song(album(artist, "A", 1990, genre="Rock"), "t1")
        song(album(artist, "B", 1992, genre="Pop"), "t2")
        empty = album(artist, "Sin género", 1996)
        song(empty, "t3")

        run("--generos", "--inferir-genero", "--aplicar")

        assert Album.objects.get(pk=empty.pk).genre == ""


class TestDryRunAndUndo:
    def test_by_default_it_only_reports_and_changes_nothing(self, artist):
        a = song(album(artist, "Uno", 1990), "Canción")
        b = song(album(artist, "Dos", 2000), "Canción")
        song(album(artist, "Sinfonía", 1990, genre="classical"), "Allegro")
        song(album(artist, "R1", 1990, genre="Rock"), "x1")
        song(album(artist, "R2", 1991, genre="rock"), "x2")

        text = run("--duplicadas", "--clasica", "--generos")

        assert "Modo prueba" in text or "modo prueba" in text
        assert not Song.objects.filter(hidden=True).exists()
        assert Album.objects.filter(genre="rock").exists()
        assert "1" in text and hidden(a, b) == [False, False]

    def test_the_report_says_how_many_it_would_hide_and_gives_examples(self, artist):
        song(album(artist, "Uno", 1990), "Canción repetida")
        song(album(artist, "Dos", 2000), "Canción repetida")

        text = run("--duplicadas")

        assert "Canción repetida" in text
        assert "Se ocultarían 1" in text

    def test_restoring_shows_again_what_the_tool_hid_but_not_what_was_hidden_by_hand(self, artist):
        a = song(album(artist, "Uno", 1990), "Canción")
        b = song(album(artist, "Dos", 2000), "Canción")
        by_hand = song(album(artist, "Otro", 1991), "Otra")
        Song.objects.filter(pk=by_hand.pk).update(hidden=True, hidden_reason="")
        run("--duplicadas", "--aplicar")
        assert hidden(a, b) == [False, True]

        run("--restaurar", "--aplicar")

        assert hidden(a, b, by_hand) == [False, False, True]

    def test_running_it_twice_changes_nothing_the_second_time(self, artist):
        song(album(artist, "Uno", 1990), "Canción")
        song(album(artist, "Dos", 2000), "Canción")
        run("--duplicadas", "--aplicar")

        text = run("--duplicadas", "--aplicar")

        assert "Se ocultaron 0" in text
