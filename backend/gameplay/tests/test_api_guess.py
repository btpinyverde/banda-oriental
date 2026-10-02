import pytest
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, Stem

DEVICE_ID = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def other_song(db):
    artist = Artist.objects.create(mbid="artist-other", name="No Te Va Gustar")
    album = Album.objects.create(mbid="album-other", name="Otra cosa", artist=artist, year=2010)
    return Song.objects.create(mbid="song-other", title="Otra canción", album=album)


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


def _guess(client, song_id, attempt_number=1, device_id=DEVICE_ID):
    return client.post(
        reverse("gameplay:guess"),
        data={"song_id": song_id, "attempt_number": attempt_number},
        content_type="application/json",
        HTTP_X_DEVICE_ID=device_id,
    )


@pytest.mark.django_db
def test_correct_guess_is_marked_correct_and_finishes_the_game(client, published_today, target_song):
    response = _guess(client, target_song.id)

    assert response.status_code == 200
    body = response.json()
    assert body["is_correct"] is True
    assert body["finished"] is True


@pytest.mark.django_db
def test_wrong_guess_returns_feedback_and_does_not_finish(client, published_today, other_song):
    response = _guess(client, other_song.id)

    body = response.json()
    assert response.status_code == 200
    assert body["is_correct"] is False
    assert body["finished"] is False
    assert body["attempts_remaining"] == 5
    assert set(body["feedback"].keys()) == {"year", "genre", "artist", "album"}


@pytest.mark.django_db
def test_guess_persists_an_attempt_row(client, published_today, other_song):
    _guess(client, other_song.id)

    attempt = GuessAttempt.objects.get(device_id=DEVICE_ID, daily_song=published_today)
    assert attempt.attempt_number == 1
    assert attempt.is_correct is False


@pytest.mark.django_db
def test_sixth_wrong_guess_finishes_the_game_without_a_score(client, published_today, other_song):
    for attempt_number in range(1, 6):
        _guess(client, other_song.id, attempt_number=attempt_number)

    response = _guess(client, other_song.id, attempt_number=6)

    assert response.json()["finished"] is True
    assert response.json()["attempts_remaining"] == 0


@pytest.mark.django_db
def test_guess_rejects_playing_again_after_losing(client, published_today, other_song):
    for attempt_number in range(1, 7):
        _guess(client, other_song.id, attempt_number=attempt_number)

    response = _guess(client, other_song.id, attempt_number=7)

    assert response.status_code == 400


@pytest.mark.django_db
def test_guess_rejects_skipping_ahead_to_a_later_attempt_number(client, published_today, other_song):
    response = _guess(client, other_song.id, attempt_number=3)

    assert response.status_code == 400


@pytest.mark.django_db
def test_guess_rejects_playing_again_after_a_win(client, published_today, target_song):
    _guess(client, target_song.id, attempt_number=1)

    response = _guess(client, target_song.id, attempt_number=2)

    assert response.status_code == 400


@pytest.mark.django_db
def test_guess_rejects_an_unknown_song_id(client, published_today):
    response = _guess(client, 999999)

    assert response.status_code == 400


@pytest.mark.django_db
def test_guess_requires_device_id_header(client, published_today, other_song):
    response = client.post(
        reverse("gameplay:guess"),
        data={"song_id": other_song.id, "attempt_number": 1},
        content_type="application/json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_guess_handles_a_concurrent_duplicate_attempt_without_a_500(
    client, published_today, other_song, monkeypatch
):
    # Two requests racing for the same attempt_number both pass the
    # existing_attempts check before either row is committed. Reproduced
    # deterministically by forcing the count to lie (as a real race
    # effectively does) and letting the database's own UniqueConstraint
    # on (device_id, daily_song, attempt_number) fire during create() —
    # exactly what a true race produces, and also the backstop that
    # otherwise lets two different songs both be scored as "attempt 1".
    from django.db.models.query import QuerySet

    GuessAttempt.objects.create(
        device_id=DEVICE_ID,
        daily_song=published_today,
        attempt_number=1,
        guessed_text="Primer intento",
        is_correct=False,
        feedback={"year": "unknown", "genre": "unknown", "artist": "different", "album": "different"},
    )
    monkeypatch.setattr(QuerySet, "count", lambda self: 0)

    response = _guess(client, other_song.id, attempt_number=1)
    monkeypatch.undo()  # restore .count() before asserting on it below

    assert response.status_code == 400
    assert GuessAttempt.objects.filter(device_id=DEVICE_ID, daily_song=published_today).count() == 1
