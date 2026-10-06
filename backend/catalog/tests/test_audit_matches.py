"""Read-only audit of the Deezer matches: which artists have discs that nothing but Deezer's word backs up (the homonym risk)."""

import csv
from io import StringIO

import pytest
from django.core.management import call_command

from catalog.models import Album, Artist, Song


def run(*args):
    out = StringIO()
    call_command("auditar_emparejados", *args, stdout=out)
    return out.getvalue()


def artist(name, deezer_id=None):
    return Artist.objects.create(mbid=f"mb-{name}", name=name, deezer_id=deezer_id)


def album(owner, name, mbid=None, deezer_id=None, songs=0):
    record = Album.objects.create(mbid=mbid, deezer_id=deezer_id, name=name, artist=owner)
    for i in range(songs):
        Song.objects.create(mbid=f"s-{name}-{i}", title=f"Tema {i}", album=record)
    return record


@pytest.mark.django_db
class TestAudit:
    def test_confirmed_when_a_disc_is_known_to_both_musicbrainz_and_deezer(self):
        a = artist("Drexler", deezer_id=1)
        album(a, "Eco", mbid="al-eco", deezer_id=11)  # the two sources agree on this one
        album(a, "Otro disco", deezer_id=12)

        out = run()

        assert "Confirmados: 1" in out
        assert "En riesgo: 0" in out

    def test_no_reference_when_musicbrainz_has_no_discs_so_deezer_decided_alone(self):
        a = artist("Cursi", deezer_id=2)
        album(a, "Disco chileno", deezer_id=21, songs=3)

        out = run()

        assert "Sin referencia: 1" in out
        assert "Cursi" in out and "Disco chileno" in out

    def test_no_match_when_musicbrainz_has_discs_but_none_is_in_deezer(self):
        a = artist("Los Homónimos", deezer_id=3)
        album(a, "Disco uruguayo", mbid="al-uy")
        album(a, "Disco ajeno", deezer_id=31, songs=2)

        out = run()

        assert "Sin coincidencia: 1" in out
        assert "Los Homónimos" in out

    def test_artists_without_a_deezer_match_are_not_part_of_the_audit(self):
        artist("Sin Deezer")

        out = run()

        assert "Emparejados con Deezer: 0" in out
        assert "Sin Deezer" not in out

    def test_counts_the_discs_and_songs_that_only_deezer_vouches_for(self):
        a = artist("Cursi", deezer_id=2)
        album(a, "Uno", deezer_id=21, songs=3)
        album(a, "Dos", deezer_id=22, songs=4)

        out = run()

        assert "2 discos y 7 canciones" in out

    def test_never_changes_anything(self):
        a = artist("Cursi", deezer_id=2)
        album(a, "Uno", deezer_id=21, songs=1)

        run()

        assert Album.objects.count() == 1 and Song.objects.count() == 1
        a.refresh_from_db()
        assert a.deezer_id == 2

    def test_writes_the_full_list_to_a_csv(self, tmp_path):
        a = artist("Cursi", deezer_id=2)
        album(a, "Uno", deezer_id=21, songs=2)
        ok = artist("Drexler", deezer_id=1)
        album(ok, "Eco", mbid="al-eco", deezer_id=11)
        path = tmp_path / "riesgo.csv"

        run("--csv", str(path))

        rows = list(csv.reader(path.open(encoding="utf-8")))
        assert rows[0][:2] == ["artista", "estado"]
        assert [r[0] for r in rows[1:]] == ["Cursi"]  # only the ones at risk
        assert rows[1][1] == "sin_referencia" and rows[1][3] == "1" and rows[1][4] == "2"
