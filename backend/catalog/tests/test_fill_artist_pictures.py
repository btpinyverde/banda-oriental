from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.db.utils import OperationalError

from catalog.deezer import DeezerError, DeezerNotFound
from catalog.models import Artist

MODULE = "catalog.management.commands.fill_artist_pictures"
PHOTO = "https://cdn-images.dzcdn.net/images/artist/abc/1000x1000.jpg"


def run(*args):
    out = StringIO()
    call_command("fill_artist_pictures", *args, stdout=out)
    return out.getvalue()


def artist(name, deezer_id=None, **extra):
    return Artist.objects.create(mbid=f"mb-{name}", name=name, deezer_id=deezer_id, **extra)


def photo_for(pictures):
    def get_artist(artist_id):
        value = pictures[artist_id]
        if isinstance(value, BaseException):
            raise value
        return {"id": artist_id, "name": "x", "picture": value}

    return get_artist


@pytest.fixture(autouse=True)
def no_waiting():
    with patch(f"{MODULE}.time.sleep"):
        yield


@pytest.mark.django_db
class TestFilling:
    def test_it_saves_the_photo_of_the_artists_matched_with_deezer(self):
        a = artist("Con Foto", deezer_id=1)

        with patch(f"{MODULE}.get_artist", side_effect=photo_for({1: PHOTO})):
            run()

        a.refresh_from_db()
        assert a.picture_url == PHOTO and a.picture_checked_at is not None

    def test_an_artist_without_a_photo_is_marked_as_looked_at_so_it_is_not_asked_again(self):
        a = artist("Sin Foto", deezer_id=2)

        with patch(f"{MODULE}.get_artist", side_effect=photo_for({2: ""})) as pedir:
            run()
            run()

        a.refresh_from_db()
        assert a.picture_url == "" and a.picture_checked_at is not None
        assert pedir.call_count == 1

    def test_it_does_not_touch_artists_that_have_a_photo_or_are_not_matched(self):
        con = artist("Ya Tiene", deezer_id=3, picture_url="https://x/mia.jpg")
        sin_emparejar = artist("Sin Deezer")

        with patch(f"{MODULE}.get_artist", side_effect=photo_for({3: PHOTO})) as pedir:
            run()

        con.refresh_from_db()
        assert con.picture_url == "https://x/mia.jpg"
        assert pedir.call_count == 0 and not Artist.objects.get(pk=sin_emparejar.pk).picture_checked_at

    def test_with_reintentar_it_asks_again_for_the_ones_already_looked_at(self):
        a = artist("Otra vez", deezer_id=4, picture_checked_at="2026-01-01T00:00:00Z")

        with patch(f"{MODULE}.get_artist", side_effect=photo_for({4: PHOTO})):
            run("--reintentar")

        a.refresh_from_db()
        assert a.picture_url == PHOTO

    def test_dry_run_changes_nothing(self):
        a = artist("Prueba", deezer_id=5)

        with patch(f"{MODULE}.get_artist", side_effect=photo_for({5: PHOTO})):
            text = run("--dry-run")

        a.refresh_from_db()
        assert a.picture_url == "" and a.picture_checked_at is None
        assert "prueba" in text.lower()

    def test_limit(self):
        for i in range(3):
            artist(f"A{i}", deezer_id=10 + i)

        with patch(f"{MODULE}.get_artist", side_effect=photo_for({10: PHOTO, 11: PHOTO, 12: PHOTO})) as pedir:
            run("--limit", "2")

        assert pedir.call_count == 2


@pytest.mark.django_db
class TestWhenSomethingFails:
    def test_one_failure_does_not_stop_the_rest_and_the_failed_one_is_taken_again_next_time(self):
        roto = artist("Roto", deezer_id=20)
        bueno = artist("Bueno", deezer_id=21)

        with patch(f"{MODULE}.get_artist", side_effect=photo_for({20: DeezerError("caído"), 21: PHOTO})):
            text = run()

        assert Artist.objects.get(pk=bueno.pk).picture_url == PHOTO
        roto.refresh_from_db()
        assert roto.picture_checked_at is None  # not marked: the next run asks again
        assert "con error" in text

    def test_an_artist_that_no_longer_exists_in_deezer_is_marked_and_skipped(self):
        a = artist("Borrado", deezer_id=22)

        with patch(f"{MODULE}.get_artist", side_effect=photo_for({22: DeezerNotFound("no existe")})):
            run()

        a.refresh_from_db()
        assert a.picture_url == "" and a.picture_checked_at is not None

    def test_when_the_database_drops_the_connection_it_reconnects_and_retries(self):
        a = artist("Conexión", deezer_id=23)
        calls = {"n": 0}
        real_save = Artist.save

        def flaky_save(self, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise OperationalError("server closed the connection unexpectedly")
            return real_save(self, *args, **kwargs)

        with patch(f"{MODULE}.get_artist", side_effect=photo_for({23: PHOTO})), patch.object(Artist, "save", flaky_save), patch(f"{MODULE}.connection.close") as cerrar:
            text = run()

        a.refresh_from_db()
        assert a.picture_url == PHOTO and cerrar.called
        assert "se perdió la conexión" in text.lower()
