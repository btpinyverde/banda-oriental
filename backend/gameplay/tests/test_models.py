from io import BytesIO

import pytest
from django.core.files.storage import InMemoryStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, ScoreEntry, Stem


@pytest.fixture
def stems_storage(monkeypatch):
    storage = InMemoryStorage()
    monkeypatch.setattr(Stem._meta.get_field("audio_file"), "storage", storage)
    return storage


def _audio_file(name="drums.mp3"):
    return SimpleUploadedFile(name, BytesIO(b"fake audio bytes").read(), content_type="audio/mpeg")


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
def test_stem_unlock_order_must_be_between_1_and_4(song):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    with pytest.raises(IntegrityError):
        Stem.objects.create(
            daily_song=daily, stem_type=Stem.DRUMS, unlock_order=0, audio_file="stems/drums.mp3"
        )


@pytest.mark.django_db
def test_stem_unlock_order_rejects_above_4(song):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    with pytest.raises(IntegrityError):
        Stem.objects.create(
            daily_song=daily, stem_type=Stem.DRUMS, unlock_order=5, audio_file="stems/drums.mp3"
        )


@pytest.mark.django_db
def test_stem_type_is_unique_per_daily_song(song):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    Stem.objects.create(
        daily_song=daily, stem_type=Stem.DRUMS, unlock_order=1, audio_file="stems/drums1.mp3"
    )
    with pytest.raises(IntegrityError):
        Stem.objects.create(
            daily_song=daily, stem_type=Stem.DRUMS, unlock_order=2, audio_file="stems/drums2.mp3"
        )


@pytest.mark.django_db
def test_deleting_a_stem_removes_its_audio_file_from_storage(
    song, stems_storage, django_capture_on_commit_callbacks
):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    stem = Stem.objects.create(
        daily_song=daily, stem_type=Stem.DRUMS, unlock_order=1, audio_file=_audio_file()
    )
    stored_name = stem.audio_file.name
    assert stems_storage.exists(stored_name)

    with django_capture_on_commit_callbacks(execute=True):
        stem.delete()

    assert not stems_storage.exists(stored_name)


@pytest.mark.django_db
def test_deleting_a_daily_song_removes_its_stems_audio_from_storage(
    song, stems_storage, django_capture_on_commit_callbacks
):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    stem = Stem.objects.create(
        daily_song=daily, stem_type=Stem.DRUMS, unlock_order=1, audio_file=_audio_file()
    )
    stored_name = stem.audio_file.name

    with django_capture_on_commit_callbacks(execute=True):
        daily.delete()  # cascades to the Stem

    assert not stems_storage.exists(stored_name)


@pytest.mark.django_db
def test_replacing_a_stems_audio_file_removes_the_old_one_from_storage(
    song, stems_storage, django_capture_on_commit_callbacks
):
    daily = DailySong.objects.create(date="2026-10-02", song=song)
    stem = Stem.objects.create(
        daily_song=daily, stem_type=Stem.DRUMS, unlock_order=1, audio_file=_audio_file("old.mp3")
    )
    old_name = stem.audio_file.name

    with django_capture_on_commit_callbacks(execute=True):
        stem.audio_file = _audio_file("new.mp3")
        stem.save()

    assert not stems_storage.exists(old_name)
    assert stems_storage.exists(stem.audio_file.name)


def test_stem_upload_path_does_not_leak_the_original_filename():
    # The resulting R2 object key ends up in the signed URL the frontend
    # sends to players (Plan 3b) — if it contained the uploader's original
    # filename (e.g. "luna-negra-drums.mp3"), that would leak the answer
    # before the player guesses it.
    from datetime import date as date_cls

    from gameplay.models import Stem, stem_upload_path

    class FakeInstance:
        stem_type = Stem.DRUMS

        class daily_song:
            date = date_cls(2026, 10, 2)

    path = stem_upload_path(FakeInstance, "luna-negra-drums.mp3")

    assert "luna-negra" not in path
    assert path.endswith(".mp3")


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
