import pytest
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, ScoreEntry, Stem

DEVICE_ID = "33333333-3333-3333-3333-333333333333"


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


@pytest.fixture
def won_on_attempt_2(db, published_today, target_song):
    GuessAttempt.objects.create(
        device_id=DEVICE_ID,
        daily_song=published_today,
        attempt_number=1,
        guessed_text="Otra canción",
        is_correct=False,
        feedback={"year": "exact", "genre": "same", "artist": "different", "album": "different"},
    )
    GuessAttempt.objects.create(
        device_id=DEVICE_ID,
        daily_song=published_today,
        attempt_number=2,
        guessed_text=target_song.title,
        is_correct=True,
        feedback={"year": "exact", "genre": "same", "artist": "same", "album": "same"},
    )
    return published_today


def _submit_score(client, display_name="Brandon", total_time_seconds=5.0, device_id=DEVICE_ID):
    return client.post(
        reverse("gameplay:score"),
        data={"display_name": display_name, "total_time_seconds": total_time_seconds},
        content_type="application/json",
        HTTP_X_DEVICE_ID=device_id,
    )


@pytest.mark.django_db
def test_score_uses_the_devices_own_recorded_winning_attempt(client, won_on_attempt_2):
    response = _submit_score(client)

    assert response.status_code == 201
    entry = ScoreEntry.objects.get(device_id=DEVICE_ID)
    assert entry.winning_attempt == 2


@pytest.mark.django_db
def test_score_ignores_a_client_submitted_winning_attempt(client, won_on_attempt_2):
    # Even if the client tries to claim attempt 1 (a better, un-earned
    # score), the server derives the real winning attempt itself.
    client.post(
        reverse("gameplay:score"),
        data={"display_name": "Brandon", "total_time_seconds": 5.0, "winning_attempt": 1},
        content_type="application/json",
        HTTP_X_DEVICE_ID=DEVICE_ID,
    )

    entry = ScoreEntry.objects.get(device_id=DEVICE_ID)
    assert entry.winning_attempt == 2


@pytest.mark.django_db
def test_score_rejects_a_device_with_no_winning_attempt(client, published_today):
    response = _submit_score(client)

    assert response.status_code == 400


@pytest.mark.django_db
def test_score_rejects_a_second_submission_for_the_same_day(client, won_on_attempt_2):
    _submit_score(client)

    response = _submit_score(client)

    assert response.status_code == 400
    assert ScoreEntry.objects.filter(device_id=DEVICE_ID).count() == 1


@pytest.mark.django_db
def test_score_rejects_a_banned_display_name(client, won_on_attempt_2):
    response = _submit_score(client, display_name="esto contiene bannedword1 feo")

    assert response.status_code == 400
    assert not ScoreEntry.objects.filter(device_id=DEVICE_ID).exists()


@pytest.mark.django_db
def test_score_rejects_a_non_string_display_name(client, won_on_attempt_2):
    response = client.post(
        reverse("gameplay:score"),
        data={"display_name": 12345, "total_time_seconds": 5.0},
        content_type="application/json",
        HTTP_X_DEVICE_ID=DEVICE_ID,
    )

    assert response.status_code == 400
    assert not ScoreEntry.objects.filter(device_id=DEVICE_ID).exists()


@pytest.mark.django_db
def test_score_rejects_a_display_name_longer_than_the_model_field(client, won_on_attempt_2):
    response = _submit_score(client, display_name="x" * 51)

    assert response.status_code == 400
    assert not ScoreEntry.objects.filter(device_id=DEVICE_ID).exists()


@pytest.mark.django_db
@pytest.mark.parametrize("bad_time", ["nan", "inf", "-inf", -5])
def test_score_rejects_a_non_finite_or_negative_total_time_seconds(client, won_on_attempt_2, bad_time):
    response = _submit_score(client, total_time_seconds=bad_time)

    assert response.status_code == 400
    assert not ScoreEntry.objects.filter(device_id=DEVICE_ID).exists()


@pytest.mark.django_db
def test_score_handles_a_concurrent_duplicate_submission_without_a_500(client, won_on_attempt_2, monkeypatch):
    # The plan's own Global Constraint: "a repeat submission must come
    # back as a clean 400, never a 500 from a raw IntegrityError." Two
    # requests racing both pass the .exists() check before either has
    # created its row. Reproduced deterministically by forcing the check
    # to lie (as a real race effectively does) and letting the database's
    # own UniqueConstraint fire during create() — exactly what a true
    # race produces.
    from django.db.models.query import QuerySet

    ScoreEntry.objects.create(
        device_id=DEVICE_ID, daily_song=won_on_attempt_2, display_name="Other",
        score=100, winning_attempt=2, total_time_seconds=5.0,
    )
    monkeypatch.setattr(QuerySet, "exists", lambda self: False)

    response = _submit_score(client)

    assert response.status_code == 400
    assert ScoreEntry.objects.filter(device_id=DEVICE_ID).count() == 1
