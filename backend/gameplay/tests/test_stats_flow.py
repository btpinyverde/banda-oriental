"""The server updates the stats itself when a game ends, owns the public name, puts a floor under the time it
believes, moves everything to the account when one is created, and exposes the result read-only."""

from datetime import timedelta

import pytest
from accounts.claim import claim_device_games
from accounts.models import AuthToken
from accounts.users import mark_confirmed
from catalog.models import Album, Artist, Song
from django.contrib.auth import get_user_model
from django.core.files.storage import InMemoryStorage
from django.urls import reverse
from django.utils import timezone

from gameplay.models import DailySong, GuessAttempt, PlayerStats, ScoreEntry, Stem

User = get_user_model()
DEVICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OTHER_DEVICE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


@pytest.fixture(autouse=True)
def memory_storage(monkeypatch):
    monkeypatch.setattr(Stem._meta.get_field("audio_file"), "storage", InMemoryStorage())


@pytest.fixture
def songs(db):
    artist = Artist.objects.create(mbid="a1", name="Jorge Drexler")
    album = Album.objects.create(mbid="al1", name="Vaivén", artist=artist, year=1996)
    return Song.objects.create(mbid="s1", title="Luna negra", album=album), Song.objects.create(
        mbid="s2", title="Otra canción", album=album
    )


@pytest.fixture
def today(songs):
    daily = DailySong.objects.create(date=timezone.localdate(), song=songs[0], state=DailySong.PUBLISHED)
    for order, (stem_type, _) in enumerate(Stem.STEM_TYPE_CHOICES, start=1):
        Stem.objects.create(daily_song=daily, stem_type=stem_type, unlock_order=order, audio_file=f"stems/f{order}.mp3")
    return daily


def user(email="ana@example.com"):
    account = User.objects.create_user(email, email, "una-clave-larga-1")
    mark_confirmed(account)
    return account


def bearer(account):
    return {"HTTP_AUTHORIZATION": f"Bearer {AuthToken.issue(account)}"}


def guess(client, song, number, device=DEVICE, auth=None):
    return client.post(
        reverse("gameplay:guess"),
        data={"song_id": song.id, "attempt_number": number},
        content_type="application/json",
        HTTP_X_DEVICE_ID=device,
        **(auth or {}),
    )


def send_score(client, name="Ana", seconds=30, device=DEVICE, auth=None, **extra):
    data = {"total_time_seconds": seconds, **extra}
    if name is not None:
        data["display_name"] = name
    return client.post(
        reverse("gameplay:score"), data=data, content_type="application/json", HTTP_X_DEVICE_ID=device, **(auth or {})
    )


def read_stats(client, device=DEVICE, auth=None):
    return client.get(reverse("gameplay:stats"), HTTP_X_DEVICE_ID=device, **(auth or {}))


class TestTheServerUpdatesStatsWhenAGameEnds:
    def test_winning_saves_the_stats_of_that_device(self, client, today, songs):
        guess(client, songs[0], 1)

        row = PlayerStats.objects.get(device_id=DEVICE)
        assert (row.played, row.won, row.current_streak, row.distribution[0]) == (1, 1, 1, 1)

    def test_losing_with_the_sixth_attempt_counts_too(self, client, today, songs):
        for n in range(1, 7):
            guess(client, songs[1], n)

        row = PlayerStats.objects.get(device_id=DEVICE)
        assert (row.played, row.won, row.current_streak) == (1, 0, 0)

    def test_a_guess_that_does_not_end_the_game_changes_nothing_yet(self, client, today, songs):
        guess(client, songs[1], 1)

        assert not PlayerStats.objects.exists()

    def test_an_account_game_goes_to_the_account_row(self, client, today, songs):
        account = user()
        guess(client, songs[0], 1, auth=bearer(account))

        assert PlayerStats.objects.get(user=account).played == 1
        assert not PlayerStats.objects.filter(device_id=DEVICE).exists()

    def test_sending_the_score_adds_it_to_the_total(self, client, today, songs):
        guess(client, songs[0], 1)

        send_score(client)

        assert PlayerStats.objects.get(device_id=DEVICE).total_score == ScoreEntry.objects.get().score > 0


class TestThePublicName:
    def test_the_first_score_sets_it_and_the_ranking_shows_it(self, client, today, songs):
        guess(client, songs[0], 1)

        send_score(client, name="  Ana  ")

        assert PlayerStats.objects.get(device_id=DEVICE).public_name == "Ana"
        assert ScoreEntry.objects.get().display_name == "Ana"

    def test_it_is_not_asked_again_and_a_different_one_cannot_be_slipped_in(self, client, today, songs):
        account = user()
        PlayerStats.objects.create(user=account, public_name="Ana")
        guess(client, songs[0], 1, auth=bearer(account))

        response = send_score(client, name="Otro nombre", auth=bearer(account))

        assert response.status_code == 201
        assert ScoreEntry.objects.get().display_name == "Ana"
        assert response.json()["display_name"] == "Ana"

    def test_with_a_name_already_set_the_score_does_not_even_need_one(self, client, today, songs):
        account = user()
        PlayerStats.objects.create(user=account, public_name="Ana")
        guess(client, songs[0], 1, auth=bearer(account))

        assert send_score(client, name=None, auth=bearer(account)).status_code == 201

    def test_without_a_name_set_a_score_must_bring_one(self, client, today, songs):
        guess(client, songs[0], 1)

        assert send_score(client, name=None).status_code == 400

    def test_two_players_cannot_share_a_name_whatever_the_case(self, client, today, songs):
        PlayerStats.objects.create(device_id=OTHER_DEVICE, public_name="ana")
        guess(client, songs[0], 1)

        response = send_score(client, name="ANA")

        assert response.status_code == 400
        assert "en uso" in response.json()["detail"]
        assert not ScoreEntry.objects.exists()

    def test_the_banned_word_filter_still_applies(self, client, today, songs, monkeypatch):
        monkeypatch.setattr("gameplay.views.contains_banned_word", lambda text: True)
        guess(client, songs[0], 1)

        assert send_score(client, name="lo que sea").status_code == 400
        assert not PlayerStats.objects.filter(public_name__isnull=False).exists()


class TestTheTimeHasAFloorTheServerObserved:
    def test_an_impossible_time_is_raised_to_what_the_server_saw_between_first_and_last_attempt(
        self, client, today, songs
    ):
        guess(client, songs[1], 1)
        guess(client, songs[0], 2)
        GuessAttempt.objects.filter(attempt_number=1).update(created_at=timezone.now() - timedelta(seconds=90))

        send_score(client, seconds=0.1)

        assert ScoreEntry.objects.get().total_time_seconds >= 89

    def test_a_slower_honest_time_is_kept_as_it_was_sent(self, client, today, songs):
        guess(client, songs[0], 1)

        send_score(client, seconds=75)

        assert ScoreEntry.objects.get().total_time_seconds == 75


class TestStatsTheClientSendsAreNotAccepted:
    def test_extra_fields_in_the_score_are_ignored(self, client, today, songs):
        guess(client, songs[0], 1)

        send_score(client, current_streak=99, max_streak=99, total_score=10**6, played=500, won=500)

        row = PlayerStats.objects.get(device_id=DEVICE)
        assert (row.current_streak, row.max_streak, row.played, row.won) == (1, 1, 1, 1)
        assert row.total_score < 10**6

    @pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
    def test_the_stats_endpoint_only_reads(self, client, method, today):
        response = getattr(client, method)(
            reverse("gameplay:stats"),
            data={"current_streak": 99},
            content_type="application/json",
            HTTP_X_DEVICE_ID=DEVICE,
        )

        assert response.status_code == 405


class TestReadingTheStats:
    def test_a_device_reads_its_own_stats_calculated_by_the_server(self, client, today, songs):
        guess(client, songs[0], 1)
        send_score(client)

        body = read_stats(client).json()

        assert body["played"] == 1 and body["won"] == 1
        assert body["current_streak"] == 1 and body["max_streak"] == 1
        assert body["distribution"] == [1, 0, 0, 0, 0, 0]
        assert body["total_score"] > 0
        assert body["public_name"] == "Ana"

    def test_a_player_with_no_games_gets_zeros_and_no_name(self, client, today):
        body = read_stats(client).json()

        assert (body["played"], body["current_streak"], body["public_name"]) == (0, 0, None)

    def test_an_account_reads_its_own_stats_from_any_device(self, client, today, songs):
        account = user()
        guess(client, songs[0], 1, device=DEVICE, auth=bearer(account))

        body = read_stats(client, device=OTHER_DEVICE, auth=bearer(account)).json()

        assert body["played"] == 1

    def test_it_never_shows_another_players_stats(self, client, today, songs):
        guess(client, songs[0], 1, device=OTHER_DEVICE)

        assert read_stats(client, device=DEVICE).json()["played"] == 0


class TestCreatingAnAccountKeepsEverything:
    def play_anonymously(self, client, songs):
        guess(client, songs[0], 1)
        send_score(client, name="Ana")

    def test_the_games_the_score_and_the_name_move_to_the_account(self, client, today, songs):
        self.play_anonymously(client, songs)
        account = user()

        claim_device_games(account, DEVICE)

        row = PlayerStats.objects.get(user=account)
        assert (row.played, row.won, row.current_streak, row.public_name) == (1, 1, 1, "Ana")
        assert row.total_score == ScoreEntry.objects.get().score
        assert not PlayerStats.objects.filter(device_id=DEVICE, user__isnull=True).exists()

    def test_an_account_with_its_own_name_keeps_it_and_the_device_name_is_released(self, client, today, songs):
        self.play_anonymously(client, songs)
        account = user()
        PlayerStats.objects.create(user=account, public_name="Ana Oficial")

        claim_device_games(account, DEVICE)

        assert PlayerStats.objects.get(user=account).public_name == "Ana Oficial"
        assert not PlayerStats.objects.filter(public_name="Ana", user__isnull=True).exists()

    def test_the_streak_continues_with_what_the_account_already_had(self, client, today, songs):
        yesterday = DailySong.objects.create(
            date=timezone.localdate() - timedelta(days=1), song=songs[1], state=DailySong.PUBLISHED
        )
        account = user()
        GuessAttempt.objects.create(
            user=account, device_id=OTHER_DEVICE, daily_song=yesterday, attempt_number=1,
            guessed_text="x", is_correct=True, feedback={},
        )
        self.play_anonymously(client, songs)

        claim_device_games(account, DEVICE)

        assert PlayerStats.objects.get(user=account).current_streak == 2

    def test_a_device_with_nothing_left_to_claim_has_no_stats_row_left(self, client, today, songs):
        self.play_anonymously(client, songs)
        claim_device_games(user(), DEVICE)

        assert PlayerStats.objects.filter(user__isnull=True).count() == 0


class TestTheSavedStreakDoesNotGoStale:
    def test_someone_who_stopped_playing_sees_the_streak_drop_when_days_pass_without_them(self, client, today, songs):
        from gameplay.stats import recompute_stats

        three_days_ago = timezone.localdate() - timedelta(days=3)
        old = DailySong.objects.create(date=three_days_ago, song=songs[1], state=DailySong.PUBLISHED)
        for gap in (2, 1):
            DailySong.objects.create(
                date=timezone.localdate() - timedelta(days=gap), song=songs[1], state=DailySong.PUBLISHED
            )
        GuessAttempt.objects.create(
            device_id=DEVICE, daily_song=old, attempt_number=1, guessed_text="x", is_correct=True, feedback={}
        )
        recompute_stats(device_id=DEVICE, today=three_days_ago)  # what the server saved back then: streak 1
        PlayerStats.objects.filter(device_id=DEVICE).update(updated_at=timezone.now() - timedelta(days=3))
        assert PlayerStats.objects.get(device_id=DEVICE).current_streak == 1

        body = read_stats(client).json()

        assert body["current_streak"] == 0
        assert body["max_streak"] == 1

    def test_reading_never_creates_a_row_for_someone_who_never_played(self, client, today):
        read_stats(client)

        assert not PlayerStats.objects.exists()
