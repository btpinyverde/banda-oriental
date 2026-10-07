"""Daily, weekly (Monday to Sunday), monthly and all-time rankings, all from the scores the server saved. Everyone
is in: accounts and anonymous players. An account counts once whatever the devices it used."""

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay import views
from gameplay.models import DailySong, PlayerStats, ScoreEntry

User = get_user_model()
D1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
D2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
D3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

TODAY = timezone.localdate()
MONDAY = TODAY - timedelta(days=TODAY.weekday())
FIRST_OF_MONTH = TODAY.replace(day=1)


@pytest.fixture
def song(db):
    artist = Artist.objects.create(mbid="a", name="A")
    album = Album.objects.create(mbid="b", name="B", artist=artist, year=2000)
    return Song.objects.create(mbid="c", title="C", album=album)


_counter = {"n": 0}


def day(song, when: date) -> DailySong:
    return DailySong.objects.get_or_create(date=when, defaults={"song": song, "state": DailySong.PUBLISHED})[0]


def score(song, when, points, name="Ana", device=D1, user=None):
    _counter["n"] += 1
    return ScoreEntry.objects.create(
        device_id=device, user=user, daily_song=day(song, when), display_name=name, score=points,
        winning_attempt=1, total_time_seconds=10,
    )


def board(client, period, device=None, auth=None):
    headers = {"HTTP_X_DEVICE_ID": device} if device else {}
    return client.get(reverse("gameplay:leaderboard"), {"period": period}, **headers, **(auth or {}))


def names(response):
    return [(e["rank"], e["display_name"], e["score"]) for e in response.json()["entries"]]


class TestHowManyPlayers:
    """To say "you are 3rd of 128" the ranking tells how many players it has, not only the top of them."""

    def test_it_says_how_many_players_there_are_even_if_only_the_top_is_shown(self, client, song):
        score(song, TODAY, 900, "Ana", D1)
        score(song, TODAY, 800, "Beto", D2)
        score(song, TODAY, 700, "Cata", D3)
        views.LEADERBOARD_LIMIT = 2
        try:
            body = board(client, "day").json()
        finally:
            views.LEADERBOARD_LIMIT = 50

        assert len(body["entries"]) == 2 and body["players"] == 3

    def test_each_period_counts_its_own_players(self, client, song):
        score(song, TODAY, 900, "Ana", D1)
        score(song, TODAY - timedelta(days=40), 800, "Vieja", D2)

        assert board(client, "day").json()["players"] == 1
        assert board(client, "all").json()["players"] == 2

    def test_an_empty_ranking_has_zero_players(self, client, db):
        assert board(client, "day").json()["players"] == 0


class TestPeriods:
    def test_the_period_is_required_to_be_one_of_the_four(self, client, db):
        assert board(client, "year").status_code == 400
        assert client.get(reverse("gameplay:leaderboard")).status_code == 400

    def test_day_is_only_todays_scores_best_first(self, client, song):
        score(song, TODAY, 800, "Ana", D1)
        score(song, TODAY, 950, "Beto", D2)
        score(song, TODAY - timedelta(days=1), 999, "Ayer", D3)

        assert names(board(client, "day")) == [(1, "Beto", 950), (2, "Ana", 800)]

    def test_week_adds_up_monday_to_sunday_of_this_week_only(self, client, song):
        score(song, MONDAY, 500, "Ana", D1)
        score(song, MONDAY + timedelta(days=6), 400, "Ana", D1)
        score(song, MONDAY - timedelta(days=1), 999, "Ana", D1)  # last Sunday: not this week
        score(song, MONDAY, 700, "Beto", D2)

        assert names(board(client, "week")) == [(1, "Ana", 900), (2, "Beto", 700)]

    def test_month_is_the_calendar_month(self, client, song):
        score(song, FIRST_OF_MONTH, 300, "Ana", D1)
        score(song, FIRST_OF_MONTH - timedelta(days=1), 999, "Ana", D1)

        assert names(board(client, "month")) == [(1, "Ana", 300)]

    def test_all_is_everything_ever(self, client, song):
        score(song, FIRST_OF_MONTH, 300, "Ana", D1)
        score(song, FIRST_OF_MONTH - timedelta(days=40), 200, "Ana", D1)

        assert names(board(client, "all")) == [(1, "Ana", 500)]

    def test_the_answer_says_which_days_it_covers(self, client, song):
        body = board(client, "week").json()

        assert (body["period"], body["from"], body["to"]) == ("week", str(MONDAY), str(MONDAY + timedelta(days=6)))


class TestWhoIsIn:
    def test_anonymous_players_and_accounts_share_the_ranking(self, client, song):
        account = User.objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
        score(song, TODAY, 900, "Cuenta", D1, user=account)
        score(song, TODAY, 700, "Anonimo", D2)

        assert [e["display_name"] for e in board(client, "day").json()["entries"]] == ["Cuenta", "Anonimo"]

    def test_an_account_is_one_player_whatever_the_devices_it_used(self, client, song):
        account = User.objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
        score(song, MONDAY, 500, "Ana", D1, user=account)
        score(song, MONDAY + timedelta(days=1), 400, "Ana", D2, user=account)

        entries = board(client, "week").json()["entries"]

        assert [(e["display_name"], e["score"], e["games"]) for e in entries] == [("Ana", 900, 2)]

    def test_the_name_shown_is_the_public_name_the_player_has_now(self, client, song):
        score(song, TODAY, 500, "Nombre viejo", D1)
        PlayerStats.objects.create(device_id=D1, public_name="Nombre actual")

        assert names(board(client, "day")) == [(1, "Nombre actual", 500)]

    def test_players_with_the_same_score_share_the_rank(self, client, song):
        score(song, TODAY, 800, "Ana", D1)
        score(song, TODAY, 800, "Beto", D2)
        score(song, TODAY, 700, "Caro", D3)

        assert [(e["rank"], e["display_name"]) for e in board(client, "day").json()["entries"]] == [
            (1, "Ana"), (1, "Beto"), (3, "Caro"),
        ]

    def test_nothing_private_leaks_into_the_ranking(self, client, song):
        score(song, TODAY, 500, "Ana", D1)

        entry = board(client, "day").json()["entries"][0]

        # Only what the page shows: never a device id, an account or an email.
        assert set(entry) == {"rank", "display_name", "score", "games", "current_streak", "win_percentage", "played"}


class TestOwnPosition:
    def test_a_player_sees_their_own_rank_even_outside_the_top(self, client, song, monkeypatch):
        monkeypatch.setattr(views, "LEADERBOARD_LIMIT", 2)
        score(song, TODAY, 900, "Ana", D1)
        score(song, TODAY, 800, "Beto", D2)
        score(song, TODAY, 100, "Caro", D3)

        body = board(client, "day", device=D3).json()

        assert [e["display_name"] for e in body["entries"]] == ["Ana", "Beto"]
        assert body["me"] == {"rank": 3, "display_name": "Caro", "score": 100, "games": 1, "current_streak": 0, "win_percentage": None, "played": 1}

    def test_without_identifying_there_is_no_me(self, client, song):
        score(song, TODAY, 100, "Ana", D1)

        assert board(client, "day").json()["me"] is None

    def test_a_player_who_has_not_scored_in_the_period_has_no_me(self, client, song):
        score(song, TODAY, 100, "Ana", D1)

        assert board(client, "day", device=D2).json()["me"] is None

    def test_an_account_sees_its_own_rank_from_any_device(self, client, song):
        from accounts.models import AuthToken

        account = User.objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
        score(song, TODAY, 100, "Ana", D1, user=account)
        auth = {"HTTP_AUTHORIZATION": f"Bearer {AuthToken.issue(account)}"}

        assert board(client, "day", device=D2, auth=auth).json()["me"]["rank"] == 1


class TestRules:
    def test_it_is_public_and_read_only(self, client, song):
        assert board(client, "day").status_code == 200
        assert client.post(reverse("gameplay:leaderboard"), {"period": "day"}).status_code == 405

    def test_it_never_shows_more_than_the_limit(self, client, song, monkeypatch):
        monkeypatch.setattr(views, "LEADERBOARD_LIMIT", 2)
        for index, device in enumerate([D1, D2, D3]):
            score(song, TODAY, 100 + index, f"J{index}", device)

        assert len(board(client, "day").json()["entries"]) == 2

    def test_an_empty_period_is_an_empty_list_not_an_error(self, client, db):
        body = board(client, "all").json()

        assert body["entries"] == [] and body["me"] is None


class TestNobodyAppearsTwiceAfterCreatingAnAccount:
    def test_a_score_left_on_the_device_for_a_day_the_account_already_played_does_not_make_a_second_row(self, client, song):
        from accounts.claim import claim_device_games
        from gameplay.models import GuessAttempt

        account = User.objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
        # The account already played today (from another device)...
        GuessAttempt.objects.create(
            user=account, device_id=D2, daily_song=day(song, TODAY), attempt_number=1, guessed_text="x",
            is_correct=True, feedback={},
        )
        score(song, TODAY, 125, "Ana", D2, user=account)
        # ...and the same person played today anonymously on this device, choosing the same name.
        GuessAttempt.objects.create(
            device_id=D1, daily_song=day(song, TODAY), attempt_number=1, guessed_text="x", is_correct=True, feedback={}
        )
        score(song, TODAY, 125, "Ana", D1)
        PlayerStats.objects.create(device_id=D1, public_name="Ana")

        claim_device_games(account, D1)

        entries = board(client, "day").json()["entries"]
        assert [(e["display_name"], e["score"]) for e in entries] == [("Ana", 125)]

    def test_the_other_days_the_account_did_not_play_still_move_over_and_count(self, client, song):
        from accounts.claim import claim_device_games

        account = User.objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
        score(song, TODAY, 500, "Ana", D1)
        score(song, TODAY - timedelta(days=1), 400, "Ana", D1)
        PlayerStats.objects.create(device_id=D1, public_name="Ana")

        claim_device_games(account, D1)

        assert [(e["display_name"], e["score"]) for e in board(client, "all").json()["entries"]] == [("Ana", 900)]


class TestNamesAreLookedUpInBulk:
    def test_the_number_of_queries_does_not_grow_with_the_number_of_old_players(self, client, song, django_assert_max_num_queries):
        for index in range(12):
            score(song, TODAY, 100 + index, f"Viejo {index}", f"{index:08d}-0000-4000-8000-000000000000")

        with django_assert_max_num_queries(10):
            board(client, "day")


class TestPagesOfTheRanking:
    """The ranking page scrolls: it asks for a page at a time and the server says whether there are more."""

    def players(self, song, how_many):
        for index in range(how_many):
            score(song, TODAY, 1000 - index, f"J{index}", f"{index:08d}-aaaa-4aaa-8aaa-aaaaaaaaaaaa")

    def page(self, client, number, size, device=None):
        headers = {"HTTP_X_DEVICE_ID": device} if device else {}
        return client.get(reverse("gameplay:leaderboard"), {"period": "day", "page": number, "page_size": size}, **headers).json()

    def test_each_page_has_the_next_rows_and_says_if_there_are_more(self, client, song):
        self.players(song, 5)

        first, second, third = (self.page(client, n, 2) for n in (1, 2, 3))

        assert [e["display_name"] for e in first["entries"]] == ["J0", "J1"] and first["has_more"] is True
        assert [e["display_name"] for e in second["entries"]] == ["J2", "J3"] and second["has_more"] is True
        assert [e["display_name"] for e in third["entries"]] == ["J4"] and third["has_more"] is False
        assert third["page"] == 3 and third["players"] == 5

    def test_the_ranks_keep_counting_across_pages(self, client, song):
        self.players(song, 4)

        assert [e["rank"] for e in self.page(client, 2, 2)["entries"]] == [3, 4]

    def test_a_page_past_the_end_is_empty_not_an_error(self, client, song):
        self.players(song, 2)

        body = self.page(client, 9, 2)

        assert body["entries"] == [] and body["has_more"] is False

    def test_the_page_size_is_capped_and_a_bad_page_falls_back_to_the_first(self, client, song):
        self.players(song, 3)

        assert len(self.page(client, 1, 5000)["entries"]) == 3
        body = client.get(reverse("gameplay:leaderboard"), {"period": "day", "page": "abc", "page_size": "x"}).json()
        assert body["page"] == 1 and len(body["entries"]) == 3

    def test_the_players_own_row_comes_on_every_page(self, client, song):
        self.players(song, 4)

        me = self.page(client, 2, 2, device="00000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa")["me"]

        assert me["display_name"] == "J3" and me["rank"] == 4

    def test_without_asking_for_a_page_it_still_answers_the_top_as_before(self, client, song, monkeypatch):
        monkeypatch.setattr(views, "LEADERBOARD_LIMIT", 2)
        self.players(song, 3)

        body = board(client, "day").json()

        assert len(body["entries"]) == 2 and body["has_more"] is True
