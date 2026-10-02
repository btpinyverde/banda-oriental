import datetime

import pytest
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong


def _song(title, artist_name="Jorge Drexler", album_name="Vaivén", instagram=""):
    artist, _ = Artist.objects.get_or_create(
        mbid=f"artist-{artist_name}", defaults={"name": artist_name, "instagram_handle": instagram}
    )
    album, _ = Album.objects.get_or_create(mbid=f"album-{album_name}", defaults={"name": album_name, "artist": artist})
    return Song.objects.create(mbid=f"song-{title}", title=title, album=album)


@pytest.mark.django_db
def test_archive_list_excludes_today_even_if_published(client):
    song = _song("Luna negra")
    DailySong.objects.create(date=timezone.localdate(), song=song, state=DailySong.PUBLISHED)

    response = client.get(reverse("gameplay:archive-list"))

    assert response.json()["days"] == []


@pytest.mark.django_db
def test_archive_list_excludes_a_draft_past_day(client):
    song = _song("Luna negra")
    yesterday = timezone.localdate() - datetime.timedelta(days=1)
    DailySong.objects.create(date=yesterday, song=song, state=DailySong.DRAFT)

    response = client.get(reverse("gameplay:archive-list"))

    assert response.json()["days"] == []


@pytest.mark.django_db
def test_archive_list_includes_a_published_past_day(client):
    song = _song("Luna negra")
    yesterday = timezone.localdate() - datetime.timedelta(days=1)
    DailySong.objects.create(date=yesterday, song=song, state=DailySong.PUBLISHED)

    response = client.get(reverse("gameplay:archive-list"))

    days = response.json()["days"]
    assert len(days) == 1
    assert days[0]["date"] == str(yesterday)
    assert days[0]["song_title"] == "Luna negra"


@pytest.mark.django_db
def test_archive_detail_returns_the_song_and_instagram_handle(client):
    song = _song("Luna negra", instagram="@jorgedrexler")
    yesterday = timezone.localdate() - datetime.timedelta(days=1)
    DailySong.objects.create(date=yesterday, song=song, state=DailySong.PUBLISHED)

    response = client.get(reverse("gameplay:archive-detail", args=[str(yesterday)]))

    body = response.json()
    assert body["song_title"] == "Luna negra"
    assert body["artist_instagram_handle"] == "@jorgedrexler"


@pytest.mark.django_db
def test_archive_detail_404s_for_todays_date(client):
    song = _song("Luna negra")
    DailySong.objects.create(date=timezone.localdate(), song=song, state=DailySong.PUBLISHED)

    response = client.get(reverse("gameplay:archive-detail", args=[str(timezone.localdate())]))

    assert response.status_code == 404


@pytest.mark.django_db
def test_archive_detail_404s_for_an_unpublished_day(client):
    response = client.get(reverse("gameplay:archive-detail", args=["2020-01-01"]))

    assert response.status_code == 404
