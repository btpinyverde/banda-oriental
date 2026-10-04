import re

import pytest
from accounts.models import AuthToken, EmailChallenge
from accounts.users import mark_confirmed
from catalog.models import Album, Artist, Song
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone

from gameplay.models import DailySong, GuessAttempt, ScoreEntry, Stem

User = get_user_model()
DEVICE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
DEVICE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PASSWORD = "una-clave-larga-1"


@pytest.fixture(autouse=True)
def fresh_cache():
    cache.clear()


@pytest.fixture
def target_song(db):
    artist = Artist.objects.create(mbid="artist-1", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-1", name="Vaivén", artist=artist, year=1996)
    return Song.objects.create(mbid="song-1", title="Luna negra", album=album)


@pytest.fixture
def other_song(db):
    artist = Artist.objects.create(mbid="artist-other", name="No Te Va Gustar")
    album = Album.objects.create(mbid="album-other", name="Otra cosa", artist=artist, year=2010)
    return Song.objects.create(mbid="song-other", title="Otra canción", album=album)


@pytest.fixture
def published_today(db, target_song):
    daily = DailySong.objects.create(date=timezone.localdate(), song=target_song, state=DailySong.PUBLISHED)
    for order, (stem_type, _) in enumerate(Stem.STEM_TYPE_CHOICES, start=1):
        Stem.objects.create(
            daily_song=daily, stem_type=stem_type, unlock_order=order, audio_file=f"stems/fake-{order}.mp3"
        )
    return daily


@pytest.fixture(autouse=True)
def stems_in_memory_storage(monkeypatch):
    from django.core.files.storage import InMemoryStorage

    monkeypatch.setattr(Stem._meta.get_field("audio_file"), "storage", InMemoryStorage())


def make_user(email="ana@example.com"):
    user = User.objects.create_user(email, email, PASSWORD)
    mark_confirmed(user)
    return user


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AuthToken.issue(user)}"}


def guess(client, song, attempt, device=DEVICE_A, auth=None):
    return client.post(
        reverse("gameplay:guess"),
        data={"song_id": song.id, "attempt_number": attempt},
        content_type="application/json",
        HTTP_X_DEVICE_ID=device,
        **(auth or {}),
    )


def daily(client, device=DEVICE_A, auth=None):
    return client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=device, **(auth or {}))


def score(client, device=DEVICE_A, auth=None, name="ana"):
    return client.post(
        reverse("gameplay:score"),
        data={"display_name": name, "total_time_seconds": 30},
        content_type="application/json",
        HTTP_X_DEVICE_ID=device,
        **(auth or {}),
    )


class TestPlayingWithAnAccount:
    def test_a_guess_is_saved_for_the_account_and_for_the_device(self, client, published_today, other_song):
        user = make_user()

        guess(client, other_song, 1, auth=bearer(user))

        attempt = GuessAttempt.objects.get()
        assert attempt.user == user and attempt.device_id == DEVICE_A

    def test_without_a_session_nothing_is_tied_to_an_account(self, client, published_today, other_song):
        guess(client, other_song, 1)

        assert GuessAttempt.objects.get().user is None

    def test_the_state_follows_the_account_to_another_device(self, client, published_today, other_song):
        user = make_user()
        auth = bearer(user)
        guess(client, other_song, 1, device=DEVICE_A, auth=auth)

        body = daily(client, device=DEVICE_B, auth=auth).json()

        assert body["attempt_number"] == 2
        assert len(body["feedback_history"]) == 1
        assert [s["stem_type"] for s in body["unlocked_stems"]] == ["drums", "bass"]

    def test_an_account_cannot_play_twice_on_the_same_day_from_two_devices(
        self, client, published_today, target_song, other_song
    ):
        user = make_user()
        auth = bearer(user)
        guess(client, target_song, 1, device=DEVICE_A, auth=auth)

        again = guess(client, other_song, 1, device=DEVICE_B, auth=auth)

        assert again.status_code == 400
        assert again.json() == {"detail": "Ya jugaste hoy."}

    def test_a_second_device_continues_the_numbering_of_the_account(self, client, published_today, other_song):
        user = make_user()
        auth = bearer(user)
        guess(client, other_song, 1, device=DEVICE_A, auth=auth)

        response = guess(client, other_song, 2, device=DEVICE_B, auth=auth)

        assert response.status_code == 200
        assert GuessAttempt.objects.filter(user=user).count() == 2

    def test_the_score_is_one_per_day_per_account_across_devices(self, client, published_today, target_song):
        user = make_user()
        auth = bearer(user)
        guess(client, target_song, 1, device=DEVICE_A, auth=auth)
        first = score(client, device=DEVICE_A, auth=auth)

        second = score(client, device=DEVICE_B, auth=auth)

        assert first.status_code == 201
        assert second.status_code == 400
        assert ScoreEntry.objects.get().user == user

    def test_the_finished_state_is_seen_from_any_device_of_the_account(self, client, published_today, target_song):
        user = make_user()
        auth = bearer(user)
        guess(client, target_song, 1, device=DEVICE_A, auth=auth)

        body = daily(client, device=DEVICE_B, auth=auth).json()

        assert body["finished"] is True and body["won"] is True

    def test_two_accounts_on_the_same_device_do_not_share_a_game(self, client, published_today, other_song):
        ana, beto = make_user("ana@example.com"), make_user("beto@example.com")
        guess(client, other_song, 1, auth=bearer(ana))

        body = daily(client, auth=bearer(beto)).json()

        assert body["attempt_number"] == 1

    def test_a_bad_token_is_a_401_and_does_not_fall_back_to_anonymous(self, client, published_today, other_song):
        response = guess(client, other_song, 1, auth={"HTTP_AUTHORIZATION": "Bearer inventado"})

        assert response.status_code == 401
        assert GuessAttempt.objects.count() == 0


def login(client, email="ana@example.com", device=None):
    extra = {"HTTP_X_DEVICE_ID": device} if device else {}
    response = client.post("/api/auth/login/", {"email": email, "password": PASSWORD}, content_type="application/json", **extra)
    assert response.status_code == 200, response.content
    return {"HTTP_AUTHORIZATION": f"Bearer {response.json()['token']}"}


class TestClaimingTheDeviceGame:
    def test_logging_in_moves_the_games_played_on_this_device_to_the_account(self, client, published_today, other_song):
        user = make_user()
        guess(client, other_song, 1)
        guess(client, other_song, 2)

        auth = login(client, device=DEVICE_A)

        assert GuessAttempt.objects.filter(user=user).count() == 2
        assert daily(client, device=DEVICE_B, auth=auth).json()["attempt_number"] == 3

    def test_it_also_moves_the_score(self, client, published_today, target_song):
        user = make_user()
        guess(client, target_song, 1)
        score(client)

        login(client, device=DEVICE_A)

        assert ScoreEntry.objects.get().user == user

    def test_if_the_account_already_played_that_day_the_account_wins_and_the_device_game_is_left_alone(
        self, client, published_today, other_song
    ):
        user = make_user()
        guess(client, other_song, 1, device=DEVICE_B, auth=bearer(user))  # the account played on device B
        guess(client, other_song, 1, device=DEVICE_A)  # and device A played anonymously
        guess(client, other_song, 2, device=DEVICE_A)

        login(client, device=DEVICE_A)

        assert GuessAttempt.objects.filter(user=user).count() == 1
        assert GuessAttempt.objects.filter(device_id=DEVICE_A, user__isnull=True).count() == 2

    def test_only_rows_without_an_owner_are_claimed(self, client, published_today, other_song):
        beto = make_user("beto@example.com")
        make_user("ana@example.com")
        guess(client, other_song, 1, device=DEVICE_A, auth=bearer(beto))  # Beto's game, played on device A

        login(client, "ana@example.com", device=DEVICE_A)

        assert GuessAttempt.objects.get().user == beto

    def test_a_past_day_is_claimed_too(self, client, published_today, other_song, target_song):
        yesterday = DailySong.objects.create(
            date=timezone.localdate() - timezone.timedelta(days=1), song=other_song, state=DailySong.PUBLISHED
        )
        user = make_user()
        GuessAttempt.objects.create(
            device_id=DEVICE_A, daily_song=yesterday, attempt_number=1, guessed_text="x", is_correct=False, feedback={}
        )

        login(client, device=DEVICE_A)

        assert GuessAttempt.objects.get().user == user

    def test_logging_in_without_a_device_header_still_works_and_claims_nothing(self, client, published_today, other_song):
        make_user()
        guess(client, other_song, 1)

        login(client)

        assert GuessAttempt.objects.get().user is None

    def test_a_malformed_device_header_is_ignored(self, client, published_today, other_song):
        make_user()
        guess(client, other_song, 1)

        login(client, device="x" * 500)

        assert GuessAttempt.objects.get().user is None

    def test_every_way_of_signing_in_claims_the_device_game(self, client, published_today, other_song):
        user = make_user()
        guess(client, other_song, 1)
        raw = EmailChallenge.issue("ana@example.com", EmailChallenge.MAGIC)

        response = client.post(
            "/api/auth/magic/verify/", {"token": raw}, content_type="application/json", HTTP_X_DEVICE_ID=DEVICE_A
        )

        assert response.status_code == 200
        assert GuessAttempt.objects.get().user == user


class TestHistory:
    def test_it_requires_a_session(self, client, db):
        assert client.get("/api/me/history/").status_code == 401

    def test_it_lists_the_account_days_newest_first_with_the_song_only_when_the_day_is_finished(
        self, client, published_today, target_song, other_song
    ):
        user = make_user()
        auth = bearer(user)
        yesterday = DailySong.objects.create(
            date=timezone.localdate() - timezone.timedelta(days=1), song=other_song, state=DailySong.PUBLISHED
        )
        for number in (1, 2):
            GuessAttempt.objects.create(
                user=user, device_id=DEVICE_A, daily_song=yesterday, attempt_number=number,
                guessed_text="x", is_correct=number == 2, feedback={"year": "exact", "genre": "same", "artist": "same", "album": "same"},
            )
        ScoreEntry.objects.create(
            user=user, device_id=DEVICE_A, daily_song=yesterday, display_name="ana", score=150, winning_attempt=2, total_time_seconds=20
        )
        guess(client, other_song, 1, auth=auth)  # today, still playing

        body = client.get("/api/me/history/", **auth).json()

        today, past = body["days"]
        assert [today["day"], past["day"]] == [str(timezone.localdate()), str(yesterday.date)]
        assert today["finished"] is False and today["song"] is None and today["won"] is False
        assert past["finished"] is True and past["won"] is True and past["winning_attempt"] == 2
        assert past["score"] == 150
        assert past["song"] == {"title": "Otra canción", "artist": "No Te Va Gustar", "album": "Otra cosa", "year": 2010}
        assert [a["attempt_number"] for a in past["attempts"]] == [1, 2]
        assert set(past["attempts"][0]["feedback"]) == {"year", "genre", "artist", "album"}

    def test_a_lost_day_is_finished_and_has_no_winning_attempt(self, client, published_today, other_song):
        user = make_user()
        for number in range(1, 7):
            GuessAttempt.objects.create(
                user=user, device_id=DEVICE_A, daily_song=published_today, attempt_number=number,
                guessed_text="x", is_correct=False, feedback={},
            )

        day = client.get("/api/me/history/", **bearer(user)).json()["days"][0]

        assert day["finished"] is True and day["won"] is False and day["winning_attempt"] is None
        assert day["song"]["title"] == "Luna negra"

    def test_it_only_shows_the_accounts_own_games(self, client, published_today, other_song):
        ana, beto = make_user("ana@example.com"), make_user("beto@example.com")
        guess(client, other_song, 1, auth=bearer(beto))

        assert client.get("/api/me/history/", **bearer(ana)).json() == {"days": []}


class TestDeletingTheAccount:
    def test_it_requires_a_session(self, client, db):
        assert client.delete("/api/me/").status_code == 401

    def test_it_deletes_the_account_with_everything_tied_to_it(self, client, published_today, target_song):
        user = make_user()
        other = make_user("beto@example.com")
        auth = bearer(user)
        guess(client, target_song, 1, device=DEVICE_A, auth=auth)
        score(client, device=DEVICE_A, auth=auth)
        guess(client, target_song, 1, device=DEVICE_B, auth=bearer(other))
        EmailChallenge.issue("ana@example.com", EmailChallenge.MAGIC)
        EmailChallenge.issue("beto@example.com", EmailChallenge.MAGIC)

        response = client.delete("/api/me/", **auth)

        assert response.status_code == 204
        assert not User.objects.filter(username="ana@example.com").exists()
        assert GuessAttempt.objects.filter(device_id=DEVICE_A).count() == 0
        assert ScoreEntry.objects.count() == 0
        assert AuthToken.objects.filter(user=user).count() == 0
        assert list(EmailChallenge.objects.values_list("email", flat=True)) == ["beto@example.com"]
        # Beto keeps his own data.
        assert GuessAttempt.objects.filter(user=other).count() == 1

    def test_games_played_without_an_account_are_not_touched(self, client, published_today, other_song):
        user = make_user()
        guess(client, other_song, 1, device=DEVICE_B)  # anonymous, never claimed

        client.delete("/api/me/", **bearer(user))

        assert GuessAttempt.objects.filter(device_id=DEVICE_B).count() == 1

    def test_the_session_stops_working(self, client, db):
        user = make_user()
        auth = bearer(user)

        client.delete("/api/me/", **auth)

        assert client.get("/api/me/", **auth).status_code == 401

    def test_the_leaderboard_forgets_the_account(self, client, published_today, target_song):
        user = make_user()
        auth = bearer(user)
        guess(client, target_song, 1, auth=auth)
        score(client, auth=auth)

        client.delete("/api/me/", **auth)

        assert client.get(reverse("gameplay:leaderboard-today")).json()["entries"] == []


class TestSharedDevicesAndLoggingOut:
    """Found by the independent review: the per-device uniqueness used to collide with the per-account games."""

    def test_an_account_can_keep_playing_on_a_device_where_it_also_played_anonymously_after_logging_out(
        self, client, published_today, other_song
    ):
        user = make_user()
        auth = bearer(user)
        for number in (1, 2, 3):
            assert guess(client, other_song, number, device=DEVICE_A, auth=auth).status_code == 200
        assert guess(client, other_song, 1, device=DEVICE_A).status_code == 200  # logged out: starts its own game

        login(client, device=DEVICE_A)
        continued = guess(client, other_song, 4, device=DEVICE_A, auth=auth)

        assert continued.status_code == 200
        assert GuessAttempt.objects.filter(user=user).count() == 4

    def test_two_accounts_can_play_the_same_day_on_the_same_computer(self, client, published_today, other_song):
        ana, beto = make_user("ana@example.com"), make_user("beto@example.com")
        guess(client, other_song, 1, auth=bearer(ana))

        response = guess(client, other_song, 1, auth=bearer(beto))

        assert response.status_code == 200

    def test_someone_without_an_account_does_not_see_the_game_an_account_played_on_that_device(
        self, client, published_today, target_song
    ):
        user = make_user()
        guess(client, target_song, 1, auth=bearer(user))  # the account won on this device

        anonymous = daily(client).json()

        assert anonymous["finished"] is False
        assert anonymous["attempt_number"] == 1

    def test_an_anonymous_win_on_a_device_does_not_block_the_accounts_own_score(self, client, published_today, target_song):
        user = make_user()
        guess(client, target_song, 1, device=DEVICE_B, auth=bearer(user))  # the account won elsewhere, no score yet
        guess(client, target_song, 1, device=DEVICE_A)  # a stranger wins anonymously on device A...
        assert score(client, device=DEVICE_A).status_code == 201  # ...and sends their score

        mine = score(client, device=DEVICE_A, auth=bearer(user), name="beto")  # the account sends its own from device A

        assert mine.status_code == 201

    def test_after_logging_out_nobody_can_send_a_score_with_the_accounts_winning_attempt(
        self, client, published_today, target_song
    ):
        user = make_user()
        guess(client, target_song, 1, device=DEVICE_A, auth=bearer(user))

        stolen = score(client, device=DEVICE_A)  # no session

        assert stolen.status_code == 400


class TestGuessedSongInTheDay:
    def test_each_attempt_comes_back_with_the_song_that_was_guessed_so_any_device_can_draw_the_row(
        self, client, published_today, other_song
    ):
        user = make_user()
        auth = bearer(user)
        guess(client, other_song, 1, device=DEVICE_A, auth=auth)

        body = daily(client, device=DEVICE_B, auth=auth).json()

        attempt = body["feedback_history"][0]
        assert attempt["guessed_text"] == "Otra canción"
        assert attempt["guessed_song"] == {
            "id": other_song.id,
            "title": "Otra canción",
            "artist": "No Te Va Gustar",
            "album": "Otra cosa",
            "year": 2010,
            "genre": "",
        }

    def test_older_attempts_without_a_stored_song_still_work(self, client, published_today):
        GuessAttempt.objects.create(
            device_id=DEVICE_A, daily_song=published_today, attempt_number=1, guessed_text="Vieja", is_correct=False,
            feedback={"year": "exact", "genre": "same", "artist": "same", "album": "same"},
        )

        attempt = daily(client).json()["feedback_history"][0]

        assert attempt["guessed_text"] == "Vieja"
        assert attempt["guessed_song"] is None

    def test_deleting_a_song_from_the_catalog_does_not_delete_the_games_that_guessed_it(
        self, client, published_today, other_song
    ):
        guess(client, other_song, 1)

        other_song.delete()

        assert GuessAttempt.objects.count() == 1
        assert daily(client).json()["feedback_history"][0]["guessed_song"] is None
