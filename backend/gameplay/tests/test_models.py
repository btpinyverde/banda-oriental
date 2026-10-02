import pytest
from django.db import IntegrityError

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, ScoreEntry, Stem


@pytest.fixture
def song(db):
    artist = Artist.objects.create(mbid="artist-mbid", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-mbid", name="Vaivén", artist=artist)
    return Song.objects.create(mbid="song-mbid", title="Luna negra", album=album)


@pytest.mark.django_db
def test_daily_song_date_is_unique(song):
    DailySong.objects.create(date="2026-10-02", song=song)
    with pytest.raises(IntegrityError):
        DailySong.objects.create(date="2026-10-02", song=song)


@pytest.mark.django_db
def test_daily_song_defaults_to_draft(song):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    assert daily.state == DailySong.DRAFT


@pytest.mark.django_db
def test_stem_unlock_order_is_unique_per_daily_song(song):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    Stem.objects.create(
        daily_song=daily, stem_type=Stem.DRUMS, unlock_order=1, audio_file="stems/drums.mp3"
    )
    with pytest.raises(IntegrityError):
        Stem.objects.create(
            daily_song=daily, stem_type=Stem.BASS, unlock_order=1, audio_file="stems/bass.mp3"
        )


@pytest.mark.django_db
def test_guess_attempt_stores_feedback_json(song):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    attempt = GuessAttempt.objects.create(
        device_id="device-1",
        daily_song=daily,
        attempt_number=1,
        guessed_text="Otra canción",
        is_correct=False,
        feedback={"year": "more_recent", "genre": "same", "artist": "different", "album": "different"},
    )
    attempt.refresh_from_db()
    assert attempt.feedback["year"] == "more_recent"


@pytest.mark.django_db
def test_score_entry_is_unique_per_device_per_daily_song(song):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    ScoreEntry.objects.create(
        device_id="device-1",
        daily_song=daily,
        display_name="Brandon",
        score=100,
        winning_attempt=1,
        total_time_seconds=4.2,
    )
    with pytest.raises(IntegrityError):
        ScoreEntry.objects.create(
            device_id="device-1",
            daily_song=daily,
            display_name="Brandon de nuevo",
            score=50,
            winning_attempt=2,
            total_time_seconds=9.0,
        )
