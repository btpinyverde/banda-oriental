"""A Deezer profile is only trusted when something other than its name backs it up: MusicBrainz or Wikidata point to the same
profile, or the discs of both sources agree. What Deezer alone brings for a profile nobody vouches for goes to quarantine."""

from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from catalog import verification as v
from catalog.models import Album, Artist, Song
from gameplay.models import DailySong


def deezer_url(artist_id, path="artist"):
    return f"https://www.deezer.com/{path}/{artist_id}"


def artist(name, deezer_id=None, status="", source=""):
    return Artist.objects.create(mbid=f"mb-{name}", name=name, deezer_id=deezer_id, deezer_status=status, deezer_source=source)


def album(owner, name, mbid=None, deezer_id=None, songs=1):
    record = Album.objects.create(mbid=mbid, deezer_id=deezer_id, name=name, artist=owner)
    for i in range(songs):
        Song.objects.create(mbid=f"s-{name}-{i}", title=f"{name} {i}", album=record)
    return record


class TestCheckDeezerLink:
    def test_musicbrainz_points_to_the_same_profile(self):
        with patch.object(v, "_musicbrainz_links", return_value=[deezer_url(4347)]):
            verdict = v.check_deezer_link("mb1", 4347)

        assert (verdict.status, verdict.source) == (v.VERIFIED, "musicbrainz")

    def test_musicbrainz_points_to_another_profile_so_ours_is_wrong(self):
        with patch.object(v, "_musicbrainz_links", return_value=[deezer_url(999)]):
            verdict = v.check_deezer_link("mb1", 4347)

        assert (verdict.status, verdict.source, verdict.suggested_id) == (v.WRONG, "musicbrainz", 999)

    @pytest.mark.parametrize("link", ["https://www.deezer.com/es/artist/4347", "http://deezer.com/artist/4347?utm_source=x", "https://deezer.com/artist/4347/"])
    def test_recognizes_the_usual_forms_of_the_link(self, link):
        with patch.object(v, "_musicbrainz_links", return_value=[link]):
            assert v.check_deezer_link("mb1", 4347).status == v.VERIFIED

    def test_links_to_albums_or_tracks_say_nothing_about_the_artist(self):
        with patch.object(v, "_musicbrainz_links", return_value=[deezer_url(4347, "album"), deezer_url(4347, "track")]):
            assert v.check_deezer_link("mb1", 4347).status == v.UNVERIFIED

    def test_falls_back_to_wikidata_when_musicbrainz_has_no_deezer_link(self):
        links = ["https://www.wikidata.org/wiki/Q123", "https://example.org"]
        with patch.object(v, "_musicbrainz_links", return_value=links), patch.object(v, "_wikidata_deezer_ids", return_value=[4347]) as wikidata:
            verdict = v.check_deezer_link("mb1", 4347)

        wikidata.assert_called_once_with("Q123")
        assert (verdict.status, verdict.source) == (v.VERIFIED, "wikidata")

    def test_wikidata_with_another_profile_says_ours_is_wrong(self):
        with patch.object(v, "_musicbrainz_links", return_value=["https://www.wikidata.org/wiki/Q123"]), patch.object(v, "_wikidata_deezer_ids", return_value=[555]):
            verdict = v.check_deezer_link("mb1", 4347)

        assert (verdict.status, verdict.source, verdict.suggested_id) == (v.WRONG, "wikidata", 555)

    def test_wikidata_without_a_deezer_id_does_not_vouch_for_anything(self):
        with patch.object(v, "_musicbrainz_links", return_value=["https://www.wikidata.org/wiki/Q123"]), patch.object(v, "_wikidata_deezer_ids", return_value=[]):
            assert v.check_deezer_link("mb1", 4347).status == v.UNVERIFIED

    def test_no_links_at_all_is_unverified(self):
        with patch.object(v, "_musicbrainz_links", return_value=[]):
            assert v.check_deezer_link("mb1", 4347).status == v.UNVERIFIED


@pytest.mark.django_db
class TestDiscEvidence:
    def test_two_discs_known_to_both_sources_and_few_extra_is_enough(self):
        a = artist("A", deezer_id=1)
        album(a, "Uno", mbid="al1", deezer_id=11)
        album(a, "Dos", mbid="al2", deezer_id=12)
        album(a, "Extra", deezer_id=13)

        assert v.disc_evidence(a) is True

    def test_a_single_disc_is_not_enough(self):
        a = artist("A", deezer_id=1)
        album(a, "Uno", mbid="al1", deezer_id=11)

        assert v.disc_evidence(a) is False

    def test_confirmed_discs_drowned_in_deezer_only_ones_is_a_mix(self):
        a = artist("AFC", deezer_id=1)
        album(a, "Uno", mbid="al1", deezer_id=11)
        album(a, "Dos", mbid="al2", deezer_id=12)
        for i in range(10):
            album(a, f"Ajeno {i}", deezer_id=100 + i)

        assert v.disc_evidence(a) is False


@pytest.mark.django_db
class TestQuarantine:
    def hidden(self):
        return set(Song.objects.filter(hidden=True, hidden_reason=v.QUARANTINE_REASON).values_list("title", flat=True))

    def test_hides_what_only_deezer_brought_for_an_unverified_artist(self):
        a = artist("Cabrera", deezer_id=1, status=v.UNVERIFIED)
        album(a, "Verdadero", mbid="al1", songs=1)  # musicbrainz: stays
        album(a, "Del otro", deezer_id=21, songs=2)  # only deezer: goes to quarantine

        assert v.hide_unverified() == 2
        assert self.hidden() == {"Del otro 0", "Del otro 1"}
        assert Song.objects.get(title="Verdadero 0").hidden is False

    def test_a_verified_artist_keeps_everything(self):
        a = artist("Canaro", deezer_id=1, status=v.VERIFIED, source="manual")
        album(a, "Disco", deezer_id=21)

        assert v.hide_unverified() == 0

    def test_a_wrong_match_is_hidden_too(self):
        a = artist("X", deezer_id=1, status=v.WRONG)
        album(a, "Ajeno", deezer_id=21)

        assert v.hide_unverified() == 1

    def test_an_artist_without_deezer_match_has_nothing_to_quarantine(self):
        a = artist("Solo MB")
        album(a, "Disco", mbid="al1")

        assert v.hide_unverified() == 0

    def test_never_touches_a_song_that_was_a_song_of_the_day(self):
        a = artist("Cabrera", deezer_id=1, status=v.UNVERIFIED)
        record = album(a, "Del otro", deezer_id=21, songs=1)
        from datetime import date
        DailySong.objects.create(date=date(2026, 1, 1), song=record.songs.get())

        assert v.hide_unverified() == 0

    def test_restore_brings_back_only_what_the_quarantine_hid(self):
        a = artist("Cabrera", deezer_id=1, status=v.UNVERIFIED)
        album(a, "Del otro", deezer_id=21, songs=1)
        other = album(a, "A mano", mbid="al-x", songs=1)
        Song.objects.filter(pk=other.songs.get().pk).update(hidden=True, hidden_reason="")
        v.hide_unverified()

        assert v.restore_quarantine() == 1
        assert Song.objects.get(title="Del otro 0").hidden is False
        assert Song.objects.get(title="A mano 0").hidden is True  # hidden by hand: not touched

    def test_scoped_to_some_artists(self):
        a = artist("A", deezer_id=1, status=v.UNVERIFIED)
        b = artist("B", deezer_id=2, status=v.UNVERIFIED)
        album(a, "De A", deezer_id=21)
        album(b, "De B", deezer_id=22)

        assert v.hide_unverified(Artist.objects.filter(pk=a.pk)) == 1
        assert self.hidden() == {"De A 0"}


def run(command, *args):
    out = StringIO()
    call_command(command, *args, stdout=out)
    return out.getvalue()


@pytest.mark.django_db
class TestVerifyCommand:
    def test_discs_that_agree_verify_without_asking_anyone(self):
        a = artist("Drexler", deezer_id=1)
        album(a, "Uno", mbid="al1", deezer_id=11)
        album(a, "Dos", mbid="al2", deezer_id=12)

        with patch("catalog.management.commands.verificar_deezer.check_deezer_link", side_effect=AssertionError("no hacía falta la red")):
            run("verificar_deezer")

        a.refresh_from_db()
        assert (a.deezer_status, a.deezer_source) == (v.VERIFIED, "discos")

    def test_the_rest_are_asked_to_musicbrainz_and_wikidata_and_the_answer_is_saved(self):
        ok = artist("Ok", deezer_id=1)
        wrong = artist("Wrong", deezer_id=2)
        unknown = artist("Unknown", deezer_id=3)
        verdicts = {1: v.Verdict(v.VERIFIED, "musicbrainz"), 2: v.Verdict(v.WRONG, "wikidata", 77), 3: v.Verdict(v.UNVERIFIED, "")}

        with patch("catalog.management.commands.verificar_deezer.check_deezer_link", side_effect=lambda mbid, deezer_id: verdicts[deezer_id]):
            out = run("verificar_deezer")

        for item in (ok, wrong, unknown):
            item.refresh_from_db()
        assert (ok.deezer_status, ok.deezer_source) == (v.VERIFIED, "musicbrainz")
        assert (wrong.deezer_status, wrong.deezer_suggested_id) == (v.WRONG, 77)
        assert unknown.deezer_status == v.UNVERIFIED
        assert "Verificados: 1" in out and "Equivocados: 1" in out and "Sin verificar: 1" in out

    def test_a_network_error_leaves_that_artist_pending_and_goes_on(self):
        bad = artist("Bad", deezer_id=1)
        good = artist("Good", deezer_id=2)

        def check(mbid, deezer_id):
            if deezer_id == 1:
                raise ConnectionError("sin red")
            return v.Verdict(v.VERIFIED, "musicbrainz")

        with patch("catalog.management.commands.verificar_deezer.check_deezer_link", side_effect=check):
            out = run("verificar_deezer")

        bad.refresh_from_db()
        good.refresh_from_db()
        assert bad.deezer_status == "" and good.deezer_status == v.VERIFIED
        assert "Con error: 1" in out

    def test_already_checked_artists_are_skipped_unless_all_is_asked(self):
        artist("Hecho", deezer_id=1, status=v.UNVERIFIED)

        with patch("catalog.management.commands.verificar_deezer.check_deezer_link") as check:
            run("verificar_deezer")
            check.assert_not_called()
            check.return_value = v.Verdict(v.VERIFIED, "musicbrainz")
            run("verificar_deezer", "--todos")
            check.assert_called_once()

    def test_dry_run_saves_nothing(self):
        a = artist("Ok", deezer_id=1)

        with patch("catalog.management.commands.verificar_deezer.check_deezer_link", return_value=v.Verdict(v.VERIFIED, "musicbrainz")):
            run("verificar_deezer", "--dry-run")

        a.refresh_from_db()
        assert a.deezer_status == ""

    def test_manual_confirmations_are_never_overwritten(self):
        a = artist("Canaro", deezer_id=1, status=v.VERIFIED, source="manual")

        with patch("catalog.management.commands.verificar_deezer.check_deezer_link", return_value=v.Verdict(v.WRONG, "musicbrainz", 5)):
            run("verificar_deezer", "--todos")

        a.refresh_from_db()
        assert (a.deezer_status, a.deezer_source) == (v.VERIFIED, "manual")


@pytest.mark.django_db
class TestQuarantineCommand:
    def setup_artists(self):
        a = artist("Cabrera", deezer_id=1, status=v.UNVERIFIED)
        album(a, "Del otro", deezer_id=21, songs=3)

    def test_it_only_reports_unless_told_to_apply(self):
        self.setup_artists()

        out = run("cuarentena_deezer")

        assert "3 canciones" in out and "no se cambia nada" in out.lower()
        assert Song.objects.filter(hidden=True).count() == 0

    def test_apply_hides_and_restore_brings_back(self):
        self.setup_artists()

        run("cuarentena_deezer", "--aplicar")
        assert Song.objects.filter(hidden=True, hidden_reason=v.QUARANTINE_REASON).count() == 3

        run("cuarentena_deezer", "--restaurar", "--aplicar")
        assert Song.objects.filter(hidden=True).count() == 0

    def test_it_refuses_while_there_are_artists_nobody_has_checked(self):
        artist("Sin revisar", deezer_id=9)

        with pytest.raises(CommandError, match="verificar_deezer"):
            run("cuarentena_deezer", "--aplicar")

    def test_clean_catalog_restore_does_not_undo_the_quarantine(self):
        self.setup_artists()
        run("cuarentena_deezer", "--aplicar")

        run("clean_catalog", "--restaurar", "--aplicar")

        assert Song.objects.filter(hidden=True, hidden_reason=v.QUARANTINE_REASON).count() == 3
