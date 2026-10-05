from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay import leaderboards
from gameplay.models import DailySong, GuessAttempt, PlayerStats, ScoreEntry

PREFIX = "[prueba]"


@pytest.fixture
def song(db):
    artist = Artist.objects.create(mbid="a", name="Zitarrosa")
    album = Album.objects.create(mbid="al", name="Disco", artist=artist, year=1970)
    return Song.objects.create(mbid="s", title="Del que se ausenta", album=album)


def publish(song, days_ago, state=DailySong.PUBLISHED):
    return DailySong.objects.create(date=timezone.localdate() - timedelta(days=days_ago), song=song, state=state)


def run(*args):
    out = StringIO()
    call_command("ranking_prueba", *args, stdout=out)
    return out.getvalue()


def real_score(daily, device="real-device", name="Persona real", score=500):
    return ScoreEntry.objects.create(
        device_id=device, daily_song=daily, display_name=name, score=score, winning_attempt=2, total_time_seconds=30
    )


class TestLooking:
    def test_it_reports_what_there_is_without_changing_anything(self, song):
        daily = publish(song, 0)
        real_score(daily)

        text = run()

        assert "Puntajes guardados: 1" in text
        assert str(daily.date) in text
        assert ScoreEntry.objects.count() == 1

    def test_it_says_so_when_there_is_nothing_and_when_there_is_no_published_day(self, db):
        text = run()

        assert "Puntajes guardados: 0" in text
        assert "No hay ningún día publicado" in text

    def test_it_shows_each_ranking_the_way_the_api_builds_it(self, song):
        real_score(publish(song, 0), name="Persona real", score=900)

        text = run()

        for period in ("day", "week", "month", "all"):
            assert period in text
        assert "Persona real" in text


class TestWhyTheRankingCanBeEmptyWhileThereAreGames:
    """The rankings are built from the saved scores, which exist only when the player taps "guardar puntaje". Players who
    won without saving have attempts and stats but no row in the ranking: the report has to show that gap."""

    def win(self, daily, device):
        return GuessAttempt.objects.create(
            device_id=device, daily_song=daily, attempt_number=1, guessed_song=daily.song, guessed_text="x", is_correct=True, feedback={}
        )

    def test_it_counts_who_won_without_saving_a_score_and_says_why_they_are_not_in_the_ranking(self, song):
        daily = publish(song, 0)
        self.win(daily, "saved-device")
        real_score(daily, device="saved-device")
        self.win(daily, "not-saved-device")
        PlayerStats.objects.create(device_id="not-saved-device", played=1, won=1, total_score=900)

        text = run()

        assert "Ganaron: 2" in text
        assert "ganaron y no guardaron su puntaje: 1" in text.lower()
        assert "Estadísticas de jugadores: 1" in text
        assert "no entran al ranking" in text

    def test_when_everyone_who_won_saved_there_is_no_gap_to_report(self, song):
        daily = publish(song, 0)
        self.win(daily, "d1")
        real_score(daily, device="d1")

        assert "ganaron y no guardaron su puntaje: 0" in run().lower()


class TestCreating:
    def test_it_creates_marked_test_scores_on_the_published_days_so_every_ranking_has_data(self, song):
        publish(song, 0)

        text = run("--crear")

        names = set(ScoreEntry.objects.values_list("display_name", flat=True))
        assert names and all(name.startswith(PREFIX) for name in names)
        for period in ("day", "all"):
            assert leaderboards.build(period, timezone.localdate(), limit=10)["entries"], period
        assert "Creados" in text

    def test_it_does_not_create_the_same_ones_twice(self, song):
        publish(song, 0)
        run("--crear")
        count = ScoreEntry.objects.count()

        run("--crear")

        assert ScoreEntry.objects.count() == count

    def test_it_only_uses_published_days(self, song):
        publish(song, 0, state=DailySong.DRAFT)

        text = run("--crear")

        assert ScoreEntry.objects.count() == 0
        assert "No hay ningún día publicado" in text

    def test_each_test_player_is_a_different_one_with_a_different_score(self, song):
        publish(song, 0)
        run("--crear")

        scores = list(ScoreEntry.objects.values_list("score", flat=True))
        assert len(set(scores)) == len(scores) > 2


class TestDeleting:
    def test_it_removes_only_the_test_scores_and_leaves_the_real_ones(self, song):
        daily = publish(song, 0)
        keep = real_score(daily)
        run("--crear")
        assert ScoreEntry.objects.count() > 1

        text = run("--borrar")

        assert list(ScoreEntry.objects.all()) == [keep]
        assert "Borrados" in text

    def test_a_real_player_whose_name_starts_like_a_test_one_is_not_touched_only_the_test_devices_are(self, song):
        daily = publish(song, 0)
        keep = real_score(daily, name="[prueba] el nombre que eligió alguien")

        run("--borrar")

        assert list(ScoreEntry.objects.all()) == [keep]
