import pytest
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, ScoreEntry


@pytest.fixture
def target_song(db):
    artist = Artist.objects.create(mbid="artist-1", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-1", name="Vaivén", artist=artist, year=1996)
    return Song.objects.create(mbid="song-1", title="Luna negra", album=album)


@pytest.fixture
def published_today(db, target_song):
    return DailySong.objects.create(date=timezone.localdate(), song=target_song, state=DailySong.PUBLISHED)


@pytest.mark.django_db
def test_leaderboard_is_empty_with_no_scores(client, published_today):
    response = client.get(reverse("gameplay:leaderboard-today"))

    assert response.status_code == 200
    assert response.json()["entries"] == []


@pytest.mark.django_db
def test_leaderboard_orders_by_score_descending(client, published_today):
    ScoreEntry.objects.create(
        device_id="a", daily_song=published_today, display_name="Low", score=50,
        winning_attempt=5, total_time_seconds=10,
    )
    ScoreEntry.objects.create(
        device_id="b", daily_song=published_today, display_name="High", score=150,
        winning_attempt=1, total_time_seconds=2,
    )

    response = client.get(reverse("gameplay:leaderboard-today"))

    names = [entry["display_name"] for entry in response.json()["entries"]]
    assert names == ["High", "Low"]


@pytest.mark.django_db
def test_leaderboard_does_not_include_device_id(client, published_today):
    ScoreEntry.objects.create(
        device_id="a", daily_song=published_today, display_name="Brandon", score=100,
        winning_attempt=1, total_time_seconds=2,
    )

    response = client.get(reverse("gameplay:leaderboard-today"))

    assert "device_id" not in response.json()["entries"][0]


@pytest.mark.django_db
def test_leaderboard_with_no_published_day_returns_empty_not_404(client):
    response = client.get(reverse("gameplay:leaderboard-today"))

    assert response.status_code == 200
    assert response.json()["entries"] == []
