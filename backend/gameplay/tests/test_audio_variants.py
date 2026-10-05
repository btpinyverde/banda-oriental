import io
import logging
import math
import random
import wave

import pytest
from django.core.files.storage import InMemoryStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay import audio
from gameplay.models import DailySong, Stem

FIELDS = ("audio_file", "audio_high", "audio_low")


def wav_bytes(seconds=2):
    """A real stereo WAV (a tone plus a little noise, so it does not compress to nothing)."""
    rng = random.Random(1)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(44100)
        frames = bytearray()
        for n in range(44100 * seconds):
            sample = int(8000 * math.sin(2 * math.pi * 440 * n / 44100) + rng.randint(-1500, 1500))
            frames += sample.to_bytes(2, "little", signed=True) * 2
        out.writeframes(bytes(frames))
    return buffer.getvalue()


@pytest.fixture(scope="module")
def wav():
    return wav_bytes()


@pytest.fixture(autouse=True)
def stems_use_in_memory_storage(monkeypatch):
    storage = InMemoryStorage()
    for name in FIELDS:
        monkeypatch.setattr(Stem._meta.get_field(name), "storage", storage)
    return storage


@pytest.fixture
def daily(db):
    artist = Artist.objects.create(mbid="a1", name="Jorge Drexler")
    album = Album.objects.create(mbid="al1", name="Vaivén", artist=artist, year=1996)
    song = Song.objects.create(mbid="s1", title="Luna negra", album=album)
    return DailySong.objects.create(date=timezone.localdate(), song=song, state=DailySong.PUBLISHED)


def upload(data, name="drums.wav"):
    return SimpleUploadedFile(name, data, content_type="audio/wav")


@pytest.fixture(autouse=True)
def conversion_runs_where_it_is_scheduled(settings):
    """In production the conversion runs in a background thread so the upload request is not held up; in the tests it
    runs right where it is scheduled, so it can be asserted."""
    settings.STEM_CONVERSION_BACKGROUND = False


@pytest.fixture(autouse=True)
def after_commit(django_capture_on_commit_callbacks):
    """Everything that is scheduled to run after the commit runs right after the save in these tests."""
    global _after_commit
    _after_commit = django_capture_on_commit_callbacks
    yield


_after_commit = None


def save_and_convert(stem):
    with _after_commit(execute=True):
        stem.save()
    return stem


def make_stem(daily, data, stem_type="drums", order=1):
    stem = Stem(daily_song=daily, stem_type=stem_type, unlock_order=order, audio_file=upload(data))
    save_and_convert(stem)
    stem.refresh_from_db()
    return stem


class TestEncoding:
    def test_a_wav_becomes_two_aac_files_and_the_lighter_one_really_is_lighter(self, wav):
        variants = audio.encode_variants(wav)

        assert set(variants) == {"high", "low"}
        for data in variants.values():
            assert data[4:8] == b"ftyp"  # an MP4/M4A container, which every browser decodes
        assert len(variants["low"]) < len(variants["high"]) < len(wav) / 5

    def test_the_title_and_artist_tags_of_the_original_do_not_travel_in_the_versions(self, wav, tmp_path):
        # The files reach the players, and a tag with the song title would give away the answer.
        tagged = tmp_path / "tagged.wav"
        tagged.write_bytes(wav)
        out = tmp_path / "tagged-tags.wav"
        import subprocess

        subprocess.run(
            [audio.ffmpeg_executable(), "-loglevel", "error", "-y", "-i", str(tagged), "-metadata", "title=Luna negra", str(out)],
            check=True,
        )

        for data in audio.encode_variants(out.read_bytes()).values():
            assert b"Luna negra" not in data

    def test_what_is_not_audio_fails_with_a_clear_error(self):
        with pytest.raises(audio.AudioError):
            audio.encode_variants(b"this is not audio")

    def test_the_ffmpeg_to_use_can_be_set_and_a_missing_one_is_a_clear_error(self, settings):
        settings.FFMPEG_BINARY = "/no/such/ffmpeg"

        with pytest.raises(audio.AudioError, match="ffmpeg"):
            audio.encode_variants(b"x")


class TestTheUploadRequestIsNotHeldUp:
    """Converting four full-length stems takes minutes on the free server, far past the 30 seconds gunicorn gives a
    request (the worker is killed and the site goes down). So the save only stores the original; the conversion follows."""

    def test_saving_does_not_convert_anything_by_itself(self, daily, wav, monkeypatch):
        monkeypatch.setattr(audio, "encode_variants", lambda data: pytest.fail("converted inside the save"))

        stem = Stem.objects.create(daily_song=daily, stem_type="drums", unlock_order=1, audio_file=upload(wav))

        stem.refresh_from_db()
        assert stem.audio_file and not stem.audio_high and not stem.audio_low

    def test_the_conversion_is_scheduled_for_after_the_commit_and_then_fills_the_versions(self, daily, wav, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            stem = Stem.objects.create(daily_song=daily, stem_type="drums", unlock_order=1, audio_file=upload(wav))
        assert len(callbacks) >= 1
        stem.refresh_from_db()
        assert not stem.audio_high

        for callback in callbacks:
            callback()

        stem.refresh_from_db()
        assert stem.audio_high.name.endswith(".m4a") and stem.audio_low.name.endswith(".m4a")

    def test_in_production_it_runs_in_a_background_thread_not_in_the_request(self, daily, wav, settings, django_capture_on_commit_callbacks):
        import threading

        settings.STEM_CONVERSION_BACKGROUND = True
        started = []
        real_thread = threading.Thread

        class Spy(real_thread):
            def start(self):
                started.append(self)  # not started: the test only checks that a thread is what would run it

        monkey = pytest.MonkeyPatch()
        monkey.setattr("gameplay.jobs.threading.Thread", Spy)
        try:
            with django_capture_on_commit_callbacks(execute=True):
                Stem.objects.create(daily_song=daily, stem_type="drums", unlock_order=1, audio_file=upload(wav))
        finally:
            monkey.undo()

        assert len(started) == 1 and started[0].daemon is True

    def test_a_replaced_audio_loses_its_old_versions_at_once_instead_of_serving_the_old_song_meanwhile(self, daily, wav):
        stem = make_stem(daily, wav)
        assert stem.audio_high

        stem = Stem.objects.get(pk=stem.pk)
        stem.audio_file = upload(wav_bytes(1), "other.wav")
        stem.save()  # no commit hooks run: the conversion has not happened yet

        stem.refresh_from_db()
        assert not stem.audio_high and not stem.audio_low

    def test_if_the_audio_is_replaced_while_converting_the_old_result_is_not_saved_over_the_new_one(self, daily, wav, monkeypatch):
        from gameplay import jobs

        stem = Stem.objects.create(daily_song=daily, stem_type="drums", unlock_order=1, audio_file=upload(wav))
        real = audio.encode_variants

        def slow_and_replaced(data):
            result = real(data)
            replacement = Stem.objects.get(pk=stem.pk)
            replacement.audio_file = "stems/replacement.wav"
            replacement.save()
            return result

        monkeypatch.setattr(audio, "encode_variants", slow_and_replaced)
        jobs.convert_stem(stem.pk)

        stem.refresh_from_db()
        assert stem.audio_file.name == "stems/replacement.wav"
        assert not stem.audio_high and not stem.audio_low


class TestSavingAStem:
    def test_uploading_a_wav_keeps_the_original_and_adds_both_versions_with_neutral_names(self, daily, wav, stems_use_in_memory_storage):
        stem = make_stem(daily, wav)

        stem.refresh_from_db()
        assert stem.audio_file.name.endswith(".wav")
        for field in (stem.audio_high, stem.audio_low):
            assert field.name.endswith(".m4a")
            assert "drums" not in field.name  # the name reaches the players: it cannot give away anything
            assert stems_use_in_memory_storage.exists(field.name)
        assert len({stem.audio_file.name, stem.audio_high.name, stem.audio_low.name}) == 3

    def test_a_file_that_cannot_be_converted_still_saves_and_is_served_as_it_is(self, daily, caplog):
        with caplog.at_level(logging.WARNING):
            stem = make_stem(daily, b"fake audio bytes")

        stem.refresh_from_db()
        assert stem.audio_file and not stem.audio_high and not stem.audio_low
        assert "no se pudo convertir" in caplog.text.lower()

    def test_saving_again_without_changing_the_file_does_not_convert_again(self, daily, wav, monkeypatch):
        stem = make_stem(daily, wav)
        monkeypatch.setattr(audio, "encode_variants", lambda data: pytest.fail("converted again"))

        stem.unlock_order = 2
        stem.save()

    def test_replacing_the_audio_converts_the_new_one_and_removes_every_old_file(self, daily, wav, stems_use_in_memory_storage, django_capture_on_commit_callbacks):
        stem = make_stem(daily, wav)
        old_names = [stem.audio_file.name, stem.audio_high.name, stem.audio_low.name]

        with django_capture_on_commit_callbacks(execute=True):
            stem = Stem.objects.get(pk=stem.pk)
            stem.audio_file = upload(wav_bytes(1), "other.wav")
            stem.save()

        stem.refresh_from_db()
        new_names = [stem.audio_file.name, stem.audio_high.name, stem.audio_low.name]
        assert not set(old_names) & set(new_names)
        assert all(stems_use_in_memory_storage.exists(n) for n in new_names)
        assert not any(stems_use_in_memory_storage.exists(n) for n in old_names)

    def test_replacing_with_a_file_that_cannot_be_converted_does_not_leave_the_old_versions_serving_the_old_audio(self, daily, wav, django_capture_on_commit_callbacks):
        stem = make_stem(daily, wav)

        with django_capture_on_commit_callbacks(execute=True):
            stem = Stem.objects.get(pk=stem.pk)
            stem.audio_file = upload(b"not audio", "x.wav")
            stem.save()

        stem.refresh_from_db()
        assert not stem.audio_high and not stem.audio_low

    def test_deleting_the_stem_removes_the_three_files(self, daily, wav, stems_use_in_memory_storage, django_capture_on_commit_callbacks):
        stem = make_stem(daily, wav)
        names = [stem.audio_file.name, stem.audio_high.name, stem.audio_low.name]

        with django_capture_on_commit_callbacks(execute=True):
            stem.delete()

        assert not any(stems_use_in_memory_storage.exists(n) for n in names)


class TestWhatThePlayersGet:
    def played(self, client, daily):
        response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID="11111111-1111-1111-1111-111111111111")
        assert response.status_code == 200
        return response.json()["unlocked_stems"]

    def test_the_url_is_the_good_version_and_the_light_one_comes_as_a_variant(self, client, daily, wav):
        stem = make_stem(daily, wav)

        [info] = self.played(client, daily)

        assert info["url"].split("?")[0].endswith(stem.audio_high.name)
        assert set(info["variants"]) == {"high", "low"}
        assert info["variants"]["high"] == info["url"]
        assert info["variants"]["low"].split("?")[0].endswith(stem.audio_low.name)

    def test_the_original_wav_is_never_what_a_player_downloads_when_there_are_versions(self, client, daily, wav):
        stem = make_stem(daily, wav)

        [info] = self.played(client, daily)

        assert stem.audio_file.name not in str(info)

    def test_a_stem_without_versions_is_served_as_before_with_no_variants(self, client, daily):
        Stem.objects.create(daily_song=daily, stem_type="drums", unlock_order=1, audio_file="stems/old.mp3")

        [info] = self.played(client, daily)

        assert info["url"].split("?")[0].endswith("stems/old.mp3")
        assert info["variants"] == {}


class TestEncodeStemsCommand:
    def old_stem(self, daily, wav, storage):
        name = storage.save("stems/legacy.wav", io.BytesIO(wav))
        return Stem.objects.create(daily_song=daily, stem_type="drums", unlock_order=1, audio_file=name)

    def test_it_converts_the_stems_that_were_uploaded_before_and_have_no_versions(self, daily, wav, stems_use_in_memory_storage):
        stem = self.old_stem(daily, wav, stems_use_in_memory_storage)

        call_command("encode_stems")

        stem.refresh_from_db()
        assert stem.audio_high.name.endswith(".m4a") and stem.audio_low.name.endswith(".m4a")
        assert stem.audio_file.name == "stems/legacy.wav"  # the original stays

    def test_it_does_not_touch_the_ones_that_already_have_them(self, daily, wav, monkeypatch):
        make_stem(daily, wav)
        monkeypatch.setattr(audio, "encode_variants", lambda data: pytest.fail("converted again"))

        call_command("encode_stems")

    def test_one_stem_that_fails_does_not_stop_the_rest(self, daily, wav, stems_use_in_memory_storage, capsys):
        broken = stems_use_in_memory_storage.save("stems/broken.wav", io.BytesIO(b"not audio"))
        Stem.objects.create(daily_song=daily, stem_type="bass", unlock_order=2, audio_file=broken)
        good = self.old_stem(daily, wav, stems_use_in_memory_storage)

        call_command("encode_stems")

        good.refresh_from_db()
        assert good.audio_high
        assert "bass" in capsys.readouterr().out.lower()


class TestAdminInline:
    def inline(self):
        from django.contrib import admin

        from gameplay.admin import StemInline

        return StemInline(Stem, admin.site)

    def test_the_versions_are_not_uploaded_by_hand_the_admin_only_shows_whether_they_exist(self, daily, wav):
        inline = self.inline()

        assert "audio_high" not in inline.fields and "audio_low" not in inline.fields

        converted = make_stem(daily, wav)
        plain = Stem.objects.create(daily_song=daily, stem_type="bass", unlock_order=2, audio_file="stems/old.mp3")
        assert "Listas" in inline.versiones(converted)
        assert "En proceso" in inline.versiones(plain)
