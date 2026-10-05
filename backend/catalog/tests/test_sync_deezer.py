import csv
from contextlib import contextmanager
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command

from catalog.deezer import DeezerError
from catalog.models import Album, Artist, Song

MODULE = "catalog.management.commands.sync_deezer"

DREXLER = {"id": 4347, "name": "Jorge Drexler", "nb_album": 43, "nb_fan": 91330}


def release(deezer_id, title, record_type="album", date="2004-09-14"):
    return {"id": deezer_id, "title": title, "record_type": record_type, "release_date": date}


def album_detail(deezer_id, title, tracks, record_type="album", year=2004, genre="Pop latino"):
    return {
        "id": deezer_id, "title": title, "record_type": record_type, "year": year, "genre": genre,
        "cover_url": f"https://cdn/{deezer_id}.jpg",
        "tracks": [{"id": t_id, "title": t_title, "duration_seconds": 200} for t_id, t_title in tracks],
    }


@contextmanager
def fake_deezer(candidates=(DREXLER,), releases=(), details=None):
    details = details or {}

    def get_album(album_id):
        if isinstance(details.get(album_id), BaseException):
            raise details[album_id]
        return details[album_id]

    with patch(f"{MODULE}.search_artists", return_value=list(candidates)) as search, \
         patch(f"{MODULE}.get_artist_releases", return_value=list(releases)) as listing, \
         patch(f"{MODULE}.get_album", side_effect=get_album) as detail:
        yield search, listing, detail


def run(*args, **options):
    out = StringIO()
    call_command("sync_deezer", *args, stdout=out, **options)
    return out.getvalue()


@pytest.fixture
def drexler(db):
    return Artist.objects.create(mbid="mb-drexler", name="Jorge Drexler")


class TestImporting:
    def test_creates_albums_and_songs_with_deezer_data(self, drexler):
        details = {7: album_detail(7, "Eco", [(100, "Al otro lado del río"), (101, "Eco")])}
        with fake_deezer(releases=[release(7, "Eco")], details=details):
            run()

        drexler.refresh_from_db()
        assert drexler.deezer_id == 4347
        assert drexler.deezer_checked_at is not None
        album = Album.objects.get(deezer_id=7)
        assert (album.name, album.year, album.genre, album.release_type) == ("Eco", 2004, "Pop latino", "album")
        assert album.cover_art_url == "https://cdn/7.jpg"
        assert album.mbid is None
        assert set(album.songs.values_list("title", "deezer_id", "duration_seconds")) == {
            ("Al otro lado del río", 100, 200), ("Eco", 101, 200)}

    def test_running_twice_does_not_duplicate_anything(self, drexler):
        details = {7: album_detail(7, "Eco", [(100, "Uno")])}
        with fake_deezer(releases=[release(7, "Eco")], details=details):
            run()
            run("--reintentar")

        assert Album.objects.count() == 1
        assert Song.objects.count() == 1

    def test_reuses_the_musicbrainz_album_instead_of_duplicating_it(self, drexler):
        mb_album = Album.objects.create(mbid="mb-eco", artist=drexler, name="Eco", year=2004, genre="singer-songwriter")
        mb_song = Song.objects.create(mbid="mb-s1", album=mb_album, title="Al Otro Lado del Río")
        details = {7: album_detail(7, "Eco (Deluxe Edition)", [(100, "Al otro lado del río"), (101, "Nueva")], genre="Pop latino")}
        with fake_deezer(releases=[release(7, "Eco (Deluxe Edition)")], details=details):
            run()

        assert Album.objects.count() == 1
        mb_album.refresh_from_db()
        assert mb_album.deezer_id == 7
        assert mb_album.genre == "singer-songwriter"  # lo que ya había no se pisa
        assert mb_album.cover_art_url == "https://cdn/7.jpg"  # lo vacío se completa
        mb_song.refresh_from_db()
        assert mb_song.deezer_id == 100 and mb_song.mbid == "mb-s1"
        assert Song.objects.filter(album=mb_album).count() == 2

    def test_never_overwrites_values_edited_by_hand(self, drexler):
        album = Album.objects.create(mbid="mb-eco", artist=drexler, name="Eco", year=1999, genre="Folk",
                                     cover_art_url="https://mi-tapa.jpg")
        with fake_deezer(releases=[release(7, "Eco")], details={7: album_detail(7, "Eco", [])}):
            run()

        album.refresh_from_db()
        assert (album.year, album.genre, album.cover_art_url) == (1999, "Folk", "https://mi-tapa.jpg")


class TestWhichReleases:
    def test_skips_live_compilations_and_duplicate_editions(self, drexler):
        releases = [
            release(1, "Eco"), release(2, "Eco (Deluxe Edition)"),
            release(3, "Eco (En Vivo)"), release(4, "Grandes éxitos", "compile"),
        ]
        details = {1: album_detail(1, "Eco", [(10, "A")]), 2: album_detail(2, "Eco (Deluxe Edition)", [(20, "B")])}
        with fake_deezer(releases=releases, details=details) as (_, _, detail):
            run()

        assert list(Album.objects.values_list("name", flat=True)) == ["Eco"]
        assert [call.args[0] for call in detail.call_args_list] == [1]

    def test_a_single_is_imported_when_its_song_is_not_on_any_album(self, drexler):
        releases = [release(9, "Luna Llena", "single", "2025-01-30")]
        details = {9: album_detail(9, "Luna Llena", [(90, "Luna Llena")], "single", 2025, "")}
        with fake_deezer(releases=releases, details=details):
            run()

        single = Album.objects.get(deezer_id=9)
        assert single.release_type == "single"
        assert single.songs.get().title == "Luna Llena"

    def test_a_single_already_on_an_album_is_skipped_without_asking_deezer(self, drexler):
        releases = [release(1, "Eco"), release(9, "Eco", "single")]
        details = {1: album_detail(1, "Eco", [(10, "Eco"), (11, "Otra")])}
        with fake_deezer(releases=releases, details=details) as (_, _, detail):
            run()

        assert Album.objects.filter(release_type="single").count() == 0
        assert Song.objects.filter(title="Eco").count() == 1
        assert [call.args[0] for call in detail.call_args_list] == [1]

    def test_a_single_with_a_new_b_side_keeps_only_the_new_song(self, drexler):
        releases = [release(1, "Eco"), release(9, "Nuevo tema", "single")]
        details = {
            1: album_detail(1, "Eco", [(10, "Eco")]),
            9: album_detail(9, "Nuevo tema", [(90, "Nuevo tema"), (91, "Eco")], "single"),
        }
        with fake_deezer(releases=releases, details=details):
            run()

        assert sorted(Song.objects.values_list("title", flat=True)) == ["Eco", "Nuevo tema"]

    def test_albums_are_processed_before_singles(self, drexler):
        # El single viene primero en el listado de Deezer, pero su canción ya está en el álbum.
        releases = [release(9, "Eco", "single"), release(1, "Disco", "album")]
        details = {1: album_detail(1, "Disco", [(10, "Eco")])}
        with fake_deezer(releases=releases, details=details):
            run()

        assert Album.objects.filter(release_type="single").count() == 0


class TestArtistMatching:
    def test_leaves_the_artist_unmatched_when_there_is_no_exact_name(self, drexler):
        wrong = {"id": 5, "name": "Jorge Drexler Tributo", "nb_album": 3, "nb_fan": 1}
        with fake_deezer(candidates=[wrong]) as (_, listing, _):
            output = run()

        drexler.refresh_from_db()
        assert drexler.deezer_id is None
        assert drexler.deezer_checked_at is not None  # ya se buscó: no se vuelve a intentar sola
        assert "Jorge Drexler" in output and "sin emparejar" in output.lower()
        listing.assert_not_called()

    def test_skips_artists_that_were_already_checked_unless_asked(self, drexler):
        with fake_deezer(releases=[]) as (search, _, _):
            run()
            run()
            assert search.call_count == 1
            run("--reintentar")
            assert search.call_count == 2

    def test_a_deezer_profile_already_used_by_another_artist_is_not_reused(self, drexler):
        Artist.objects.create(mbid="mb-otro", name="Otro Artista", deezer_id=4347)
        with fake_deezer(releases=[release(7, "Eco")], details={7: album_detail(7, "Eco", [])}) as (_, listing, _):
            output = run("--artista", "Jorge Drexler")

        drexler.refresh_from_db()
        assert drexler.deezer_id is None
        assert "ya está asignado" in output
        listing.assert_not_called()

    def test_writes_a_csv_with_the_unmatched_artists(self, drexler, tmp_path):
        path = tmp_path / "sin-emparejar.csv"
        wrong = {"id": 5, "name": "Otro", "nb_album": 3, "nb_fan": 1}
        with fake_deezer(candidates=[wrong]):
            run("--reporte", str(path))

        rows = list(csv.DictReader(path.open(encoding="utf-8")))
        assert rows == [{"artista": "Jorge Drexler", "mbid": "mb-drexler", "candidatos_deezer": "Otro (5)"}]


class TestSelection:
    def test_limit_and_single_artist_filters(self, db):
        for n in range(3):
            Artist.objects.create(mbid=f"m{n}", name=f"Artista {n}")
        with fake_deezer(candidates=[]) as (search, _, _):
            run("--limit", "2")
            assert search.call_count == 2
            search.reset_mock()
            run("--artista", "artista 0")
            assert search.call_count == 1
            assert search.call_args.args[0] == "Artista 0"


class TestSafety:
    def test_dry_run_writes_nothing(self, drexler):
        details = {7: album_detail(7, "Eco", [(100, "Uno")])}
        with fake_deezer(releases=[release(7, "Eco")], details=details):
            output = run("--dry-run")

        drexler.refresh_from_db()
        assert drexler.deezer_id is None and drexler.deezer_checked_at is None
        assert Album.objects.count() == 0 and Song.objects.count() == 0
        assert "prueba" in output.lower()

    def test_a_failing_release_does_not_stop_the_others_and_the_artist_is_retried_later(self, drexler):
        releases = [release(1, "Roto"), release(2, "Sano")]
        details = {1: DeezerError("se rindió"), 2: album_detail(2, "Sano", [(20, "Tema")])}
        with fake_deezer(releases=releases, details=details):
            output = run()

        assert list(Album.objects.values_list("name", flat=True)) == ["Sano"]
        drexler.refresh_from_db()
        assert drexler.deezer_checked_at is None  # incompleto: la próxima corrida lo retoma
        assert "se rindió" in output

    def test_a_failure_searching_the_artist_is_reported_and_the_run_continues(self, db):
        Artist.objects.create(mbid="a", name="Uno")
        Artist.objects.create(mbid="b", name="Dos")
        with patch(f"{MODULE}.search_artists", side_effect=[DeezerError("caído"), []]) as search:
            output = run()

        assert search.call_count == 2
        assert "caído" in output
        assert Artist.objects.get(name="Uno").deezer_checked_at is None

    def test_each_release_is_saved_as_soon_as_it_is_done_so_cutting_the_run_loses_nothing(self, drexler):
        releases = [release(1, "Primero"), release(2, "Segundo")]
        details = {1: album_detail(1, "Primero", [(10, "Tema")]), 2: KeyboardInterrupt()}
        with fake_deezer(releases=releases, details=details):
            with pytest.raises(KeyboardInterrupt):
                run()

        assert list(Album.objects.values_list("name", flat=True)) == ["Primero"]


class TestWhenTheDatabaseConnectionDrops:
    """From a computer over wifi, the cloud database sometimes closes the connection in the middle of a long run ("server
    closed the connection unexpectedly"). The run must reconnect and go on, not die and leave the person starting over."""

    def drop(self):
        from django.db.utils import OperationalError

        return OperationalError("server closed the connection unexpectedly")

    def test_it_reconnects_and_retries_the_same_artist(self, drexler, monkeypatch):
        from catalog.management.commands import sync_deezer

        calls = {"n": 0}
        real = sync_deezer.Command._sync_artist

        def flaky(self, artist):
            calls["n"] += 1
            if calls["n"] == 1:
                raise TestWhenTheDatabaseConnectionDrops().drop()
            return real(self, artist)

        monkeypatch.setattr(sync_deezer.Command, "_sync_artist", flaky)
        monkeypatch.setattr(sync_deezer.time, "sleep", lambda s: None)
        closed = []
        monkeypatch.setattr(sync_deezer.connection, "close", lambda: closed.append(True))
        details = {7: album_detail(7, "Eco", [(100, "Eco")])}

        with fake_deezer(releases=[release(7, "Eco")], details=details):
            text = run()

        assert calls["n"] == 2 and closed == [True]
        assert Song.objects.filter(title="Eco").exists()
        assert "se perdió la conexión" in text.lower() and "reintent" in text.lower()

    def test_after_too_many_drops_it_gives_up_on_that_artist_and_goes_on_with_the_next(self, drexler, monkeypatch):
        from catalog.management.commands import sync_deezer

        other = Artist.objects.create(mbid="mb-other", name="Otro Artista")
        seen = []

        def always_drops_for_the_first(self, artist):
            seen.append(artist.name)
            if artist.pk == drexler.pk:
                raise TestWhenTheDatabaseConnectionDrops().drop()

        monkeypatch.setattr(sync_deezer.Command, "_sync_artist", always_drops_for_the_first)
        monkeypatch.setattr(sync_deezer.time, "sleep", lambda s: None)
        monkeypatch.setattr(sync_deezer.connection, "close", lambda: None)

        with fake_deezer():
            text = run()

        assert seen.count("Jorge Drexler") == sync_deezer.DB_ATTEMPTS and "Otro Artista" in seen
        assert "artistas con error" in text and other.pk  # the summary says one artist failed and the run finished
        drexler.refresh_from_db()
        assert drexler.deezer_checked_at is None  # not marked as done: the next run takes it again

    def test_an_error_that_is_not_a_connection_problem_is_not_hidden(self, drexler, monkeypatch):
        from django.db.utils import IntegrityError

        from catalog.management.commands import sync_deezer

        def broken(self, artist):
            raise IntegrityError("duplicate key")

        monkeypatch.setattr(sync_deezer.Command, "_sync_artist", broken)

        with fake_deezer(), pytest.raises(IntegrityError):
            run()
