"""Stats are the server's: computed from the attempts and scores it validated and saved, never taken from the
client. These tests pin the rules (what counts as a played day, how streaks run) with explicit days."""

from datetime import date, timedelta

import pytest
from django.contrib.auth.models import User

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, PlayerStats, ScoreEntry
from gameplay.stats import recompute_stats

DEVICE = "44444444-4444-4444-4444-444444444444"
TODAY = date(2026, 10, 10)


@pytest.fixture
def songs(db):
    artist = Artist.objects.create(mbid="a1", name="Artista")
    album = Album.objects.create(mbid="al1", name="Disco", artist=artist, year=1990)
    return [Song.objects.create(mbid=f"s{i}", title=f"Tema {i}", album=album) for i in range(12)]


@pytest.fixture
def days(songs):
    """Published songs for the 8 days up to TODAY (index 0 = TODAY-7 ... index 7 = TODAY)."""
    return [
        DailySong.objects.create(date=TODAY - timedelta(days=7 - i), song=songs[i], state=DailySong.PUBLISHED)
        for i in range(8)
    ]


@pytest.fixture
def user(db):
    return User.objects.create_user("jugadora@example.com", password="x" * 12)


def play(daily, *, won=True, tries=2, user=None, device=DEVICE, score=None):
    """A finished game: `tries` attempts, the last one right if `won`; with 6 wrong attempts if lost."""
    owner = {"user": user} if user else {}
    count = tries if won else 6
    for n in range(1, count + 1):
        GuessAttempt.objects.create(
            device_id=device,
            daily_song=daily,
            attempt_number=n,
            guessed_text="x",
            is_correct=won and n == count,
            feedback={},
            **owner,
        )
    if score is not None:
        ScoreEntry.objects.create(
            device_id=device, daily_song=daily, display_name="n", score=score, winning_attempt=count, total_time_seconds=30, **owner
        )


def stats(**owner):
    return recompute_stats(today=TODAY, **owner)


class TestWhatCounts:
    def test_a_player_with_no_games_has_all_zeros(self, days):
        result = stats(device_id=DEVICE)

        assert (result.played, result.won, result.current_streak, result.max_streak, result.total_score) == (0, 0, 0, 0, 0)
        assert result.distribution == [0, 0, 0, 0, 0, 0]
        assert result.last_played_day is None

    def test_won_and_lost_games_are_counted_and_the_distribution_has_the_winning_attempts(self, days):
        play(days[5], won=True, tries=3)
        play(days[6], won=False)
        play(days[7], won=True, tries=1)

        result = stats(device_id=DEVICE)

        assert (result.played, result.won) == (3, 2)
        assert result.distribution == [1, 0, 1, 0, 0, 0]
        assert result.last_played_day == TODAY

    def test_a_game_in_progress_is_not_a_played_day(self, days):
        GuessAttempt.objects.create(
            device_id=DEVICE, daily_song=days[7], attempt_number=1, guessed_text="x", is_correct=False, feedback={}
        )

        assert stats(device_id=DEVICE).played == 0

    def test_total_score_adds_up_the_saved_scores(self, days):
        play(days[6], tries=2, score=900)
        play(days[7], tries=1, score=1000)

        assert stats(device_id=DEVICE).total_score == 1900

    def test_a_win_without_a_saved_score_still_counts_as_a_win(self, days):
        play(days[7], won=True, tries=2)

        result = stats(device_id=DEVICE)

        assert (result.won, result.total_score) == (1, 0)

    def test_other_players_games_are_not_mixed_in(self, days):
        play(days[7], device="55555555-5555-5555-5555-555555555555")

        assert stats(device_id=DEVICE).played == 0


class TestStreaks:
    def test_consecutive_wins_up_to_today_make_the_current_streak(self, days):
        for daily in days[5:]:
            play(daily)

        result = stats(device_id=DEVICE)

        assert (result.current_streak, result.max_streak) == (3, 3)

    def test_today_not_played_yet_does_not_break_the_streak(self, days):
        for daily in days[4:7]:
            play(daily)

        assert stats(device_id=DEVICE).current_streak == 3

    def test_losing_today_resets_the_current_streak_but_keeps_the_best(self, days):
        for daily in days[4:7]:
            play(daily)
        play(days[7], won=False)

        result = stats(device_id=DEVICE)

        assert (result.current_streak, result.max_streak) == (0, 3)

    def test_a_missed_day_breaks_the_streak(self, days):
        play(days[3])
        play(days[4])
        play(days[6])
        play(days[7])

        result = stats(device_id=DEVICE)

        assert (result.current_streak, result.max_streak) == (2, 2)

    def test_the_best_streak_can_be_an_old_one(self, days):
        for daily in days[0:4]:
            play(daily)
        play(days[7])

        result = stats(device_id=DEVICE)

        assert (result.current_streak, result.max_streak) == (1, 4)

    def test_a_day_without_a_published_song_does_not_break_the_streak(self, days):
        days[5].state = DailySong.DRAFT
        days[5].save()
        play(days[4])
        play(days[6])
        play(days[7])

        result = stats(device_id=DEVICE)

        assert (result.current_streak, result.max_streak) == (3, 3)

    def test_a_game_in_progress_today_leaves_the_streak_as_it_was(self, days):
        play(days[5])
        play(days[6])
        GuessAttempt.objects.create(
            device_id=DEVICE, daily_song=days[7], attempt_number=1, guessed_text="x", is_correct=False, feedback={}
        )

        assert stats(device_id=DEVICE).current_streak == 2


class TestStoringAndOwners:
    def test_the_result_is_saved_in_a_row_that_is_updated_not_duplicated(self, days):
        play(days[6])
        stats(device_id=DEVICE)
        play(days[7])
        stats(device_id=DEVICE)

        assert PlayerStats.objects.filter(device_id=DEVICE).count() == 1
        assert PlayerStats.objects.get(device_id=DEVICE).played == 2

    def test_an_account_has_its_own_row_whatever_the_device(self, days, user):
        play(days[6], user=user, device="66666666-6666-6666-6666-666666666666")
        play(days[7], user=user, device=DEVICE)

        result = stats(user=user)

        assert (result.played, result.current_streak) == (2, 2)
        assert PlayerStats.objects.get(user=user).device_id == ""

    def test_the_account_does_not_see_the_games_the_device_played_without_it(self, days, user):
        play(days[6])

        assert stats(user=user).played == 0

    def test_a_player_can_keep_a_public_name_that_recomputing_does_not_erase(self, days):
        stats(device_id=DEVICE)
        PlayerStats.objects.filter(device_id=DEVICE).update(public_name="Fulano")
        play(days[7])

        stats(device_id=DEVICE)

        assert PlayerStats.objects.get(device_id=DEVICE).public_name == "Fulano"

    def test_it_needs_an_owner(self, days):
        with pytest.raises(ValueError):
            recompute_stats(today=TODAY)
