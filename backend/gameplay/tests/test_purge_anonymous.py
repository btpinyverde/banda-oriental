"""An anonymous player who has not played for a week is deleted: nothing is gained by keeping a record nobody can
claim any more. Accounts are never touched."""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.maintenance import purge_inactive_anonymous
from gameplay.models import DailySong, GuessAttempt, PlayerStats, ScoreEntry

User = get_user_model()
OLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
RECENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


@pytest.fixture
def daily(db):
    artist = Artist.objects.create(mbid="a", name="A")
    album = Album.objects.create(mbid="b", name="B", artist=artist, year=2000)
    song = Song.objects.create(mbid="c", title="C", album=album)
    return DailySong.objects.create(date=timezone.localdate(), song=song, state=DailySong.PUBLISHED)


def played(daily, device, days_ago, user=None, name=None, number=1):
    when = timezone.now() - timedelta(days=days_ago)
    attempt = GuessAttempt.objects.create(
        device_id=device, user=user, daily_song=daily, attempt_number=number, guessed_text="x",
        is_correct=True, feedback={},
    )
    GuessAttempt.objects.filter(pk=attempt.pk).update(created_at=when)
    if name:
        score = ScoreEntry.objects.create(
            device_id=device, user=user, daily_song=daily, display_name=name, score=500,
            winning_attempt=1, total_time_seconds=10,
        )
        ScoreEntry.objects.filter(pk=score.pk).update(created_at=when)
    stats = PlayerStats.objects.create(device_id="" if user else device, user=user, public_name=name)
    PlayerStats.objects.filter(pk=stats.pk).update(updated_at=when)
    return attempt


class TestWhatIsDeleted:
    def test_a_device_idle_for_more_than_a_week_loses_its_games_scores_and_stats(self, daily):
        played(daily, OLD, days_ago=8, name="Ana")

        counts = purge_inactive_anonymous(days=7)

        assert not GuessAttempt.objects.exists()
        assert not ScoreEntry.objects.exists()
        assert not PlayerStats.objects.exists()
        assert counts == {"devices": 1, "attempts": 1, "scores": 1, "stats": 1}

    def test_a_device_that_played_within_the_week_is_kept(self, daily):
        played(daily, RECENT, days_ago=6, name="Beto")

        purge_inactive_anonymous(days=7)

        assert GuessAttempt.objects.count() == ScoreEntry.objects.count() == PlayerStats.objects.count() == 1

    def test_only_the_idle_device_goes_when_two_are_mixed(self, daily):
        played(daily, OLD, days_ago=30, name="Ana")
        played(daily, RECENT, days_ago=1, name="Beto")

        purge_inactive_anonymous(days=7)

        assert set(GuessAttempt.objects.values_list("device_id", flat=True)) == {RECENT}
        assert set(PlayerStats.objects.values_list("public_name", flat=True)) == {"Beto"}

    def test_one_recent_attempt_keeps_the_whole_device(self, daily):
        played(daily, OLD, days_ago=20, name="Ana", number=1)
        played_again = GuessAttempt.objects.create(
            device_id=OLD, daily_song=daily, attempt_number=2, guessed_text="y", is_correct=False, feedback={}
        )

        purge_inactive_anonymous(days=7)

        assert GuessAttempt.objects.filter(pk=played_again.pk).exists()
        assert GuessAttempt.objects.filter(device_id=OLD).count() == 2

    def test_accounts_are_never_touched_however_old(self, daily):
        account = User.objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
        played(daily, OLD, days_ago=400, user=account, name="Cuenta")

        purge_inactive_anonymous(days=7)

        assert GuessAttempt.objects.filter(user=account).count() == 1
        assert ScoreEntry.objects.filter(user=account).count() == 1
        assert PlayerStats.objects.filter(user=account).count() == 1

    def test_the_leftovers_of_an_old_device_are_deleted_but_what_it_gave_to_an_account_stays(self, daily):
        account = User.objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
        played(daily, OLD, days_ago=40, user=account, name="Cuenta")
        other_day = DailySong.objects.create(
            date=daily.date - timedelta(days=1), song=daily.song, state=DailySong.PUBLISHED
        )
        played(other_day, OLD, days_ago=40)

        purge_inactive_anonymous(days=7)

        assert GuessAttempt.objects.count() == 1 and GuessAttempt.objects.get().user == account

    def test_the_name_of_a_deleted_player_can_be_taken_again(self, daily):
        played(daily, OLD, days_ago=9, name="Ana")

        purge_inactive_anonymous(days=7)
        PlayerStats.objects.create(device_id=RECENT, public_name="Ana")  # would violate the unique name before

    def test_a_dry_run_reports_and_deletes_nothing(self, daily):
        played(daily, OLD, days_ago=9, name="Ana")

        counts = purge_inactive_anonymous(days=7, dry_run=True)

        assert counts["devices"] == 1
        assert GuessAttempt.objects.count() == 1 and PlayerStats.objects.count() == 1

    def test_zero_days_means_it_is_switched_off(self, daily):
        played(daily, OLD, days_ago=900, name="Ana")

        assert purge_inactive_anonymous(days=0) == {"devices": 0, "attempts": 0, "scores": 0, "stats": 0}
        assert GuessAttempt.objects.count() == 1


class TestTheCommand:
    def test_it_prints_what_it_did(self, daily):
        played(daily, OLD, days_ago=9, name="Ana")
        out = StringIO()

        call_command("purge_inactive_anonymous", "--days", "7", stdout=out)

        assert "1" in out.getvalue() and not GuessAttempt.objects.exists()

    def test_dry_run_flag_changes_nothing(self, daily):
        played(daily, OLD, days_ago=9, name="Ana")

        call_command("purge_inactive_anonymous", "--dry-run", stdout=StringIO())

        assert GuessAttempt.objects.count() == 1


class TestItRunsByItselfOncePerDay:
    @pytest.fixture(autouse=True)
    def switch_on(self, settings):
        settings.PURGE_ANONYMOUS_AFTER_DAYS = 7
        settings.PURGE_IN_BACKGROUND = False  # run inline so the test can see it
        cache.clear()

    def test_the_first_request_of_the_day_triggers_it_and_the_next_ones_do_not(self, client, db):
        with patch("gameplay.maintenance.purge_inactive_anonymous") as purge:
            client.get("/api/health/")
            client.get("/api/health/")
            client.get("/api/health/")

        assert purge.call_count == 1

    def test_a_failure_in_the_purge_never_breaks_the_request(self, client, db):
        with patch("gameplay.maintenance.purge_inactive_anonymous", side_effect=RuntimeError("boom")):
            response = client.get("/api/health/")

        assert response.status_code == 200

    def test_it_stays_off_when_the_setting_is_zero(self, client, db, settings):
        settings.PURGE_ANONYMOUS_AFTER_DAYS = 0
        with patch("gameplay.maintenance.purge_inactive_anonymous") as purge:
            client.get("/api/health/")

        purge.assert_not_called()


class TestARacePlayerWhoComesBackIsNotDeleted:
    def test_a_device_that_played_after_the_idle_list_was_made_is_taken_off_it(self, daily):
        from datetime import timedelta
        from gameplay.maintenance import still_idle

        played(daily, OLD, days_ago=20, name="Ana", number=1)
        GuessAttempt.objects.create(
            device_id=OLD, daily_song=daily, attempt_number=2, guessed_text="y", is_correct=False, feedback={}
        )  # came back just now
        cutoff = timezone.now() - timedelta(days=7)

        assert still_idle([OLD, RECENT], cutoff) == [RECENT]


class TestTheBackgroundThreadCleansUp:
    def test_it_closes_its_own_database_connection(self):
        from core import middleware

        with patch("core.middleware.connection") as connection, patch("gameplay.maintenance.purge_inactive_anonymous"):
            middleware._run_purge(7, close_connection=True)

        connection.close.assert_called_once()

    def test_inline_it_leaves_the_connection_alone(self):
        from core import middleware

        with patch("core.middleware.connection") as connection, patch("gameplay.maintenance.purge_inactive_anonymous"):
            middleware._run_purge(7, close_connection=False)

        connection.close.assert_not_called()
