from io import BytesIO

import pytest
from django.core.files.storage import InMemoryStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, ScoreEntry, Stem

DEVICE_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(autouse=True)
def stems_use_in_memory_storage(monkeypatch):
    # Views that read stem.audio_file.url otherwise hit the real,
    # unconfigured S3Storage client in tests (same issue Plan 3a's admin
    # tests hit) — see gameplay/tests/test_admin.py's identical fixture.
    monkeypatch.setattr(Stem._meta.get_field("audio_file"), "storage", InMemoryStorage())


@pytest.fixture
def target_song(db):
    artist = Artist.objects.create(mbid="artist-1", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-1", name="Vaivén", artist=artist, year=1996)
    return Song.objects.create(mbid="song-1", title="Luna negra", album=album)


@pytest.fixture
def published_today(db, target_song):
    daily = DailySong.objects.create(
        date=timezone.localdate(), song=target_song, state=DailySong.PUBLISHED
    )
    for order, (stem_type, _) in enumerate(Stem.STEM_TYPE_CHOICES, start=1):
        Stem.objects.create(
            daily_song=daily, stem_type=stem_type, unlock_order=order, audio_file=f"stems/fake-{order}.mp3"
        )
    return daily


@pytest.mark.django_db
def test_daily_requires_device_id_header(client):
    response = client.get(reverse("gameplay:daily"))
    assert response.status_code == 400


@pytest.mark.django_db
def test_daily_returns_404_when_no_published_song_today(client):
    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)
    assert response.status_code == 404


@pytest.mark.django_db
def test_daily_ignores_a_draft_song_for_today(client, target_song):
    DailySong.objects.create(date=timezone.localdate(), song=target_song, state=DailySong.DRAFT)

    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)

    assert response.status_code == 404


@pytest.mark.django_db
def test_daily_on_first_visit_unlocks_only_the_first_stem(client, published_today):
    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)

    assert response.status_code == 200
    body = response.json()
    assert body["attempt_number"] == 1
    assert body["attempts_remaining"] == 6
    assert len(body["unlocked_stems"]) == 1
    assert body["feedback_history"] == []
    assert "song" not in body  # the answer is never present before winning/losing


@pytest.mark.django_db
def test_daily_unlocked_stems_go_through_storage_url_and_never_leak_the_original_filename(
    client, target_song
):
    # A plain string audio_file (as used by the `published_today` fixture
    # for the other tests here) bypasses stem_upload_path entirely, so it
    # can't prove this. Upload a real file so the random-uuid naming from
    # Plan 3a's filename-leak fix actually runs.
    daily = DailySong.objects.create(
        date=timezone.localdate(), song=target_song, state=DailySong.PUBLISHED
    )
    Stem.objects.create(
        daily_song=daily,
        stem_type=Stem.DRUMS,
        unlock_order=1,
        audio_file=SimpleUploadedFile(
            "luna-negra-drums.mp3", BytesIO(b"fake audio").read(), content_type="audio/mpeg"
        ),
    )

    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)

    url = response.json()["unlocked_stems"][0]["url"]
    assert "luna-negra" not in url


@pytest.mark.django_db
def test_daily_reflects_attempts_already_made(client, published_today):
    GuessAttempt.objects.create(
        device_id=DEVICE_ID,
        daily_song=published_today,
        attempt_number=1,
        guessed_text="Otra canción",
        is_correct=False,
        feedback={"year": "exact", "genre": "same", "artist": "different", "album": "different"},
    )

    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)

    body = response.json()
    assert body["attempt_number"] == 2
    assert len(body["unlocked_stems"]) == 2
    assert len(body["feedback_history"]) == 1
    assert body["feedback_history"][0]["feedback"]["year"] == "exact"


@pytest.mark.django_db
def test_daily_returns_final_result_once_the_device_already_scored(client, published_today):
    GuessAttempt.objects.create(
        device_id=DEVICE_ID,
        daily_song=published_today,
        attempt_number=1,
        guessed_text="Luna negra",
        is_correct=True,
        feedback={"year": "exact", "genre": "same", "artist": "same", "album": "same"},
    )
    ScoreEntry.objects.create(
        device_id=DEVICE_ID,
        daily_song=published_today,
        display_name="Brandon",
        score=150,
        winning_attempt=1,
        total_time_seconds=2.0,
    )

    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)

    body = response.json()
    assert body["finished"] is True
    assert body["won"] is True
    assert body["song"]["title"] == "Luna negra"


@pytest.mark.django_db
def test_daily_reveals_the_answer_after_six_failed_attempts_with_no_score(client, published_today):
    for attempt_number in range(1, 7):
        GuessAttempt.objects.create(
            device_id=DEVICE_ID,
            daily_song=published_today,
            attempt_number=attempt_number,
            guessed_text="Otra canción",
            is_correct=False,
            feedback={"year": "exact", "genre": "same", "artist": "different", "album": "different"},
        )

    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)

    body = response.json()
    assert body["finished"] is True
    assert body["won"] is False
    assert body["song"]["title"] == "Luna negra"


@pytest.mark.django_db
def test_daily_does_not_leak_another_devices_progress(client, published_today):
    GuessAttempt.objects.create(
        device_id="other-device",
        daily_song=published_today,
        attempt_number=1,
        guessed_text="Otra canción",
        is_correct=False,
        feedback={"year": "exact", "genre": "same", "artist": "different", "album": "different"},
    )

    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)

    body = response.json()
    assert body["attempt_number"] == 1
    assert body["feedback_history"] == []
