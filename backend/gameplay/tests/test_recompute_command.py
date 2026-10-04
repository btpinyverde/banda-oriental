from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, PlayerStats

DEVICE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"


@pytest.fixture
def played_before_the_stats_existed(db):
    artist = Artist.objects.create(mbid="a", name="A")
    album = Album.objects.create(mbid="b", name="B", artist=artist, year=2000)
    song = Song.objects.create(mbid="c", title="C", album=album)
    daily = DailySong.objects.create(date=timezone.localdate(), song=song, state=DailySong.PUBLISHED)
    GuessAttempt.objects.create(
        device_id=DEVICE, daily_song=daily, attempt_number=1, guessed_text="C", is_correct=True, feedback={}
    )


def test_it_builds_the_stats_of_everyone_who_already_played(played_before_the_stats_existed):
    assert not PlayerStats.objects.exists()

    out = StringIO()
    call_command("recompute_stats", stdout=out)

    row = PlayerStats.objects.get(device_id=DEVICE)
    assert (row.played, row.won) == (1, 1)
    assert "1" in out.getvalue()


def test_running_it_twice_changes_nothing(played_before_the_stats_existed):
    call_command("recompute_stats", stdout=StringIO())
    call_command("recompute_stats", stdout=StringIO())

    assert PlayerStats.objects.count() == 1


def test_accounts_are_included_too(played_before_the_stats_existed):
    from django.contrib.auth import get_user_model

    account = get_user_model().objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
    GuessAttempt.objects.update(user=account)

    call_command("recompute_stats", stdout=StringIO())

    assert PlayerStats.objects.get(user=account).played == 1


class TestNamesFromBeforeTheStatsExisted:
    def legacy(self, daily, device, name, minutes_ago):
        from datetime import timedelta
        from gameplay.models import ScoreEntry

        GuessAttempt.objects.create(
            device_id=device, daily_song=daily, attempt_number=1, guessed_text="C", is_correct=True, feedback={}
        )
        entry = ScoreEntry.objects.create(
            device_id=device, daily_song=daily, display_name=name, score=500, winning_attempt=1, total_time_seconds=10
        )
        ScoreEntry.objects.filter(pk=entry.pk).update(created_at=timezone.now() - timedelta(minutes=minutes_ago))

    def test_the_name_a_player_already_used_becomes_their_public_name(self, played_before_the_stats_existed):
        daily = DailySong.objects.get()
        GuessAttempt.objects.all().delete()
        self.legacy(daily, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Juan", 10)

        call_command("recompute_stats", stdout=StringIO())

        assert PlayerStats.objects.get(device_id="dddddddd-dddd-4ddd-8ddd-dddddddddddd").public_name == "Juan"

    def test_if_two_old_players_used_the_same_name_the_earlier_one_keeps_it_and_the_other_has_none(
        self, played_before_the_stats_existed
    ):
        daily = DailySong.objects.get()
        GuessAttempt.objects.all().delete()
        first, second = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "ffffffff-ffff-4fff-8fff-ffffffffffff"
        self.legacy(daily, second, "juan", 5)
        self.legacy(daily, first, "Juan", 50)

        call_command("recompute_stats", stdout=StringIO())

        assert PlayerStats.objects.get(device_id=first).public_name == "Juan"
        assert PlayerStats.objects.get(device_id=second).public_name is None

    def test_a_name_someone_already_took_is_not_taken_away(self, played_before_the_stats_existed):
        daily = DailySong.objects.get()
        GuessAttempt.objects.all().delete()
        PlayerStats.objects.create(device_id="11111111-1111-4111-8111-111111111111", public_name="Juan")
        self.legacy(daily, "22222222-2222-4222-8222-222222222222", "JUAN", 5)

        call_command("recompute_stats", stdout=StringIO())

        assert PlayerStats.objects.get(device_id="11111111-1111-4111-8111-111111111111").public_name == "Juan"
        assert PlayerStats.objects.get(device_id="22222222-2222-4222-8222-222222222222").public_name is None

    def test_running_it_again_changes_nothing(self, played_before_the_stats_existed):
        daily = DailySong.objects.get()
        GuessAttempt.objects.all().delete()
        self.legacy(daily, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Juan", 10)
        call_command("recompute_stats", stdout=StringIO())
        call_command("recompute_stats", stdout=StringIO())

        assert list(PlayerStats.objects.values_list("public_name", flat=True)) == ["Juan"]
