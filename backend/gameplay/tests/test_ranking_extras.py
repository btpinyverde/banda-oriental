"""What the ranking page needs besides the table: streak and accuracy of each player, the best streaks, who played the most
songs, and the global numbers. Everything comes from what the server saved (PlayerStats, ScoreEntry), never from the client."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, PlayerStats, ScoreEntry

TODAY = timezone.localdate()


@pytest.fixture
def song(db):
    artist = Artist.objects.create(mbid="a", name="A")
    album = Album.objects.create(mbid="b", name="B", artist=artist, year=2000)
    return Song.objects.create(mbid="c", title="C", album=album)


def day(song, days_ago=0):
    return DailySong.objects.get_or_create(date=TODAY - timedelta(days=days_ago), defaults={"song": song, "state": DailySong.PUBLISHED})[0]


def score(song, device, name, points, days_ago=0):
    return ScoreEntry.objects.create(
        device_id=device, daily_song=day(song, days_ago), display_name=name, score=points, winning_attempt=1, total_time_seconds=10
    )


def stats(device, name, played=0, won=0, streak=0, max_streak=0):
    return PlayerStats.objects.create(device_id=device, public_name=name, played=played, won=won, current_streak=streak, max_streak=max_streak)


def board(client, period="day"):
    return client.get(reverse("gameplay:leaderboard"), {"period": period}).json()


class TestEachRowOfTheRanking:
    def test_it_has_the_streak_the_accuracy_and_the_songs_played_of_each_player(self, client, song):
        score(song, "d1", "Ana", 900)
        stats("d1", "Ana", played=10, won=8, streak=5, max_streak=7)

        [row] = board(client)["entries"]

        assert row["current_streak"] == 5
        assert row["win_percentage"] == 80
        assert row["played"] == 10

    def test_a_player_without_stats_gets_zeros_and_no_accuracy_instead_of_an_error(self, client, song):
        score(song, "d2", "Beto", 700)

        [row] = board(client)["entries"]

        assert (row["current_streak"], row["win_percentage"], row["played"]) == (0, None, 1)  # played falls back to the scores it has

    def test_the_players_own_row_has_them_too(self, client, song):
        mine = "33333333-3333-4333-8333-333333333333"
        score(song, mine, "Yo", 500)
        stats(mine, "Yo", played=4, won=1, streak=1)

        me = client.get(reverse("gameplay:leaderboard"), {"period": "day"}, HTTP_X_DEVICE_ID=mine).json()["me"]

        assert (me["win_percentage"], me["played"], me["current_streak"]) == (25, 4, 1)


class TestHighlights:
    def url(self):
        return reverse("gameplay:leaderboard-highlights")

    def test_the_best_streaks_and_who_played_the_most_songs_top_five(self, client, song):
        for i in range(7):
            stats(f"d{i}", f"Jugador{i}", played=10 + i, won=5, streak=i, max_streak=i)

        body = client.get(self.url()).json()

        assert [(r["display_name"], r["value"]) for r in body["streaks"]] == [(f"Jugador{i}", i) for i in (6, 5, 4, 3, 2)]
        assert [(r["display_name"], r["value"]) for r in body["songs"]] == [(f"Jugador{i}", 10 + i) for i in (6, 5, 4, 3, 2)]

    def test_players_without_a_public_name_or_without_games_are_not_listed(self, client, song):
        stats("sin-nombre", None, played=50, won=40, streak=30)
        stats("sin-juegos", "SinJuegos", played=0, streak=0)
        stats("ok", "Ok", played=3, won=2, streak=2)

        body = client.get(self.url()).json()

        assert [r["display_name"] for r in body["streaks"]] == ["Ok"]
        assert [r["display_name"] for r in body["songs"]] == ["Ok"]

    def test_a_tie_is_broken_by_name_so_the_order_is_steady(self, client, song):
        stats("d1", "Beto", played=5, won=1, streak=2)
        stats("d2", "Ana", played=5, won=1, streak=2)

        body = client.get(self.url()).json()

        assert [r["display_name"] for r in body["streaks"]] == ["Ana", "Beto"]

    def test_it_does_not_give_away_anything_private(self, client, song):
        stats("secreto-device-id", "Ok", played=3, won=2, streak=2)

        assert "secreto-device-id" not in client.get(self.url()).content.decode()

    def test_empty_is_an_empty_answer(self, client, db):
        assert client.get(self.url()).json() == {"streaks": [], "songs": []}


class TestGlobalNumbers:
    def url(self):
        return reverse("gameplay:global-stats")

    def test_players_games_and_days(self, client, song):
        stats("d1", "Ana", played=10, won=5)
        stats("d2", "Beto", played=5, won=1)
        stats("d3", "Nada", played=0)
        day(song, 2)
        day(song, 1)
        day(song, 0)

        body = client.get(self.url()).json()

        assert body == {"players": 2, "games": 15, "days": 3}

    def test_a_day_that_is_still_a_draft_or_in_the_future_does_not_count(self, client, song):
        day(song, 1)
        DailySong.objects.create(date=TODAY + timedelta(days=1), song=song, state=DailySong.PUBLISHED)
        DailySong.objects.create(date=TODAY - timedelta(days=5), song=song, state=DailySong.DRAFT)

        assert client.get(self.url()).json()["days"] == 1

    def test_empty_is_zeros(self, client, db):
        assert client.get(self.url()).json() == {"players": 0, "games": 0, "days": 0}

    def test_it_is_public_cacheable_and_read_only(self, client, db):
        response = client.get(self.url())

        assert response.status_code == 200 and "max-age" in response["Cache-Control"]
        assert client.post(self.url(), {}).status_code == 405
