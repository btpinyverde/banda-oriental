"""A player can change their public name: same rules as when they chose it (filter, unique whatever the case), a wait
between changes, and the new name shows in every ranking. Accounts and anonymous players alike."""

from datetime import timedelta

import pytest
from accounts.claim import claim_device_games
from accounts.models import AuthToken
from catalog.models import Album, Artist, Song
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from gameplay import stats as stats_module
from gameplay.models import DailySong, GuessAttempt, PlayerStats, ScoreEntry

User = get_user_model()
DEVICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


@pytest.fixture
def day(db):
    artist = Artist.objects.create(mbid="a", name="A")
    album = Album.objects.create(mbid="b", name="B", artist=artist, year=2000)
    song = Song.objects.create(mbid="c", title="C", album=album)
    return DailySong.objects.create(date=timezone.localdate(), song=song, state=DailySong.PUBLISHED)


@pytest.fixture
def named(day):
    """A device that already chose the name "Ana" and has one score."""
    PlayerStats.objects.create(device_id=DEVICE, public_name="Ana")
    ScoreEntry.objects.create(
        device_id=DEVICE, daily_song=day, display_name="Ana", score=500, winning_attempt=1, total_time_seconds=10
    )


def rename(client, name, device=DEVICE, auth=None):
    return client.put(
        reverse("gameplay:change-name"),
        data={"public_name": name},
        content_type="application/json",
        HTTP_X_DEVICE_ID=device,
        **(auth or {}),
    )


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AuthToken.issue(user)}"}


class TestChangingTheName:
    def test_the_name_changes_and_the_answer_is_the_players_stats(self, client, named):
        response = rename(client, "  Anita  ")

        assert response.status_code == 200
        assert response.json()["public_name"] == "Anita"
        assert PlayerStats.objects.get(device_id=DEVICE).public_name == "Anita"

    def test_the_old_scores_carry_the_new_name_too(self, client, named):
        rename(client, "Anita")

        assert ScoreEntry.objects.get().display_name == "Anita"

    def test_every_ranking_shows_the_new_name(self, client, named):
        rename(client, "Anita")

        for period in ("day", "week", "month", "all"):
            entries = client.get(reverse("gameplay:leaderboard"), {"period": period}).json()["entries"]
            assert [e["display_name"] for e in entries] == ["Anita"]

    def test_only_the_case_can_change(self, client, named):
        assert rename(client, "ANA").status_code == 200
        assert PlayerStats.objects.get(device_id=DEVICE).public_name == "ANA"

    def test_sending_the_same_name_changes_nothing_and_does_not_start_the_wait(self, client, named):
        assert rename(client, "Ana").status_code == 200
        assert PlayerStats.objects.get(device_id=DEVICE).name_changed_at is None

    def test_an_account_changes_its_own_name_from_any_device(self, client, day):
        account = User.objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
        PlayerStats.objects.create(user=account, public_name="Ana")

        response = rename(client, "Anita", device=OTHER, auth=bearer(account))

        assert response.status_code == 200
        assert PlayerStats.objects.get(user=account).public_name == "Anita"

    def test_a_player_cannot_touch_someone_elses_name(self, client, named):
        PlayerStats.objects.create(device_id=OTHER, public_name="Beto")

        rename(client, "Nuevo", device=OTHER)

        assert PlayerStats.objects.get(device_id=DEVICE).public_name == "Ana"


class TestTheRules:
    def test_someone_without_a_name_yet_is_told_it_is_chosen_with_the_first_score(self, client, day):
        response = rename(client, "Ana")

        assert response.status_code == 400
        assert "primer puntaje" in response.json()["detail"]
        assert not PlayerStats.objects.exists()  # asking never creates a row

    @pytest.mark.parametrize("bad", ["", "   ", "x" * 51, 5, None, ["a"]])
    def test_an_empty_too_long_or_not_text_name_is_refused(self, client, named, bad):
        assert rename(client, bad).status_code == 400
        assert PlayerStats.objects.get(device_id=DEVICE).public_name == "Ana"

    def test_the_banned_word_filter_applies(self, client, named, monkeypatch):
        monkeypatch.setattr("gameplay.views.contains_banned_word", lambda text: True)

        assert rename(client, "lo que sea").status_code == 400
        assert PlayerStats.objects.get(device_id=DEVICE).public_name == "Ana"

    def test_a_name_someone_else_has_is_refused_whatever_the_case(self, client, named):
        PlayerStats.objects.create(device_id=OTHER, public_name="Beto")

        response = rename(client, "bETO")

        assert response.status_code == 400
        assert "en uso" in response.json()["detail"]
        assert PlayerStats.objects.get(device_id=DEVICE).public_name == "Ana"


class TestTheWaitBetweenChanges:
    def test_a_second_change_right_after_is_refused_with_a_code_and_the_date_it_will_be_possible(self, client, named):
        rename(client, "Anita")

        response = rename(client, "Anita2")

        assert response.status_code == 400
        assert response.json()["code"] == "name_change_too_soon"
        assert "7 días" in response.json()["detail"]
        assert PlayerStats.objects.get(device_id=DEVICE).public_name == "Anita"

    def test_after_the_wait_it_can_change_again(self, client, named):
        rename(client, "Anita")
        PlayerStats.objects.filter(device_id=DEVICE).update(name_changed_at=timezone.now() - timedelta(days=8))

        assert rename(client, "Anita2").status_code == 200

    def test_the_wait_is_configurable_and_zero_means_no_wait(self, client, named, settings):
        settings.PUBLIC_NAME_CHANGE_COOLDOWN_DAYS = 0
        rename(client, "Anita")

        assert rename(client, "Anita2").status_code == 200


class TestProtection:
    def test_it_asks_for_the_human_check_when_it_is_on(self, client, named, settings):
        settings.TURNSTILE_SECRET_KEY = "secreto"

        response = rename(client, "Anita")

        assert response.status_code == 403
        assert response.json()["code"] == "human_check_required"

    def test_it_really_has_its_own_rate_limit(self, client, named, monkeypatch):
        from core.throttling import IpThrottle, ScopedIpThrottle

        rates = {"global": "1000/min", "name": "2/min"}
        monkeypatch.setattr(IpThrottle, "THROTTLE_RATES", rates)
        monkeypatch.setattr(ScopedIpThrottle, "THROTTLE_RATES", rates)

        statuses = [rename(client, "").status_code for _ in range(3)]

        assert statuses == [400, 400, 429]

    @pytest.mark.parametrize("body", [[1], "texto", 5, None])
    def test_a_body_that_is_not_an_object_is_a_400_not_a_crash(self, client, named, body):
        response = client.put(
            reverse("gameplay:change-name"), data=body, content_type="application/json", HTTP_X_DEVICE_ID=DEVICE
        )

        assert response.status_code == 400

    @pytest.mark.parametrize("method", ["get", "post", "patch", "delete"])
    def test_only_put_is_allowed(self, client, named, method):
        response = getattr(client, method)(reverse("gameplay:change-name"), HTTP_X_DEVICE_ID=DEVICE)

        assert response.status_code == 405


class TestFindingsFromTheReview:
    def test_the_wait_cannot_be_dodged_by_creating_an_account(self, client, named):
        rename(client, "Anita")
        account = User.objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")

        claim_device_games(account, DEVICE)  # the account adopts the name... and the wait that came with it

        response = rename(client, "Anita2", device=OTHER, auth=bearer(account))
        assert response.status_code == 400
        assert response.json()["code"] == "name_change_too_soon"
        assert PlayerStats.objects.get(user=account).public_name == "Anita"

    def test_a_score_saved_while_the_name_was_being_changed_carries_the_new_name(self, client, day, monkeypatch):
        PlayerStats.objects.create(device_id=DEVICE, public_name="Ana")
        GuessAttempt.objects.create(
            device_id=DEVICE, daily_song=day, attempt_number=1, guessed_text="x", is_correct=True, feedback={}
        )
        real = stats_module.recompute_stats

        def rename_in_the_middle(**owner):
            PlayerStats.objects.filter(device_id=DEVICE).update(public_name="Anita")  # the other request got there first
            return real(**owner)

        monkeypatch.setattr("gameplay.views.recompute_stats", rename_in_the_middle)

        response = client.post(
            reverse("gameplay:score"),
            data={"display_name": "Ana", "total_time_seconds": 30},
            content_type="application/json",
            HTTP_X_DEVICE_ID=DEVICE,
        )

        assert response.status_code == 201
        assert ScoreEntry.objects.get().display_name == "Anita"
        assert response.json()["display_name"] == "Anita"
