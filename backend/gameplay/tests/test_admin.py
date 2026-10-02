from io import BytesIO

import pytest
from django.contrib.auth import get_user_model
from django.core.files.storage import InMemoryStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, Stem

User = get_user_model()


@pytest.fixture
def staff_client(client, db):
    user = User.objects.create_superuser(
        username="admin@example.com", email="admin@example.com", password="pw"
    )
    client.force_login(user)
    return client


@pytest.fixture
def song(db):
    artist = Artist.objects.create(mbid="artist-mbid", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-mbid", name="Vaivén", artist=artist)
    return Song.objects.create(mbid="song-mbid", title="Luna negra", album=album)


@pytest.fixture(autouse=True)
def stems_use_in_memory_storage(monkeypatch):
    # `@override_settings(STORAGES=...)` does NOT work here: Django's
    # FileField resolves a callable `storage=` exactly once, at class
    # definition time (see FileField.__init__, which does
    # `self.storage = self.storage()`), long before any test's
    # override_settings takes effect. Patching the already-resolved
    # field's storage directly is the only thing that actually swaps it
    # for the duration of a test — proving the R2 config itself is
    # Task 2's job, not this one's.
    monkeypatch.setattr(Stem._meta.get_field("audio_file"), "storage", InMemoryStorage())


def _stem_file(name):
    return SimpleUploadedFile(name, BytesIO(b"fake audio bytes").read(), content_type="audio/mpeg")


@pytest.mark.django_db
def test_admin_creates_daily_song_with_four_stems(staff_client, song):
    # Uses an in-memory storage for "stems" here, not R2 — this test proves
    # the admin's validation and save behavior, not that R2 itself works
    # (Task 2 already proved the config points at R2; hitting the real
    # bucket on every test run would be slow and non-hermetic).
    data = {
        "date": "2026-10-02",
        "song": song.pk,
        "state": DailySong.DRAFT,
        "stems-TOTAL_FORMS": "4",
        "stems-INITIAL_FORMS": "0",
        "stems-MIN_NUM_FORMS": "0",
        "stems-MAX_NUM_FORMS": "4",
    }
    files = {}
    for i, (stem_type, _) in enumerate(Stem.STEM_TYPE_CHOICES):
        data[f"stems-{i}-stem_type"] = stem_type
        data[f"stems-{i}-unlock_order"] = str(i + 1)
        files[f"stems-{i}-audio_file"] = _stem_file(f"{stem_type}.mp3")

    response = staff_client.post(
        reverse("admin:gameplay_dailysong_add"), {**data, **files}, follow=True
    )

    assert response.status_code == 200
    daily = DailySong.objects.get(date="2026-10-02")
    assert daily.stems.count() == 4
    assert set(daily.stems.values_list("unlock_order", flat=True)) == {1, 2, 3, 4}


@pytest.mark.django_db
def test_admin_rejects_daily_song_with_only_three_stems(staff_client, song):
    data = {
        "date": "2026-10-02",
        "song": song.pk,
        "state": DailySong.DRAFT,
        "stems-TOTAL_FORMS": "3",
        "stems-INITIAL_FORMS": "0",
        "stems-MIN_NUM_FORMS": "0",
        "stems-MAX_NUM_FORMS": "4",
    }
    files = {}
    for i, (stem_type, _) in enumerate(Stem.STEM_TYPE_CHOICES[:3]):
        data[f"stems-{i}-stem_type"] = stem_type
        data[f"stems-{i}-unlock_order"] = str(i + 1)
        files[f"stems-{i}-audio_file"] = _stem_file(f"{stem_type}.mp3")

    staff_client.post(reverse("admin:gameplay_dailysong_add"), {**data, **files}, follow=True)

    assert not DailySong.objects.filter(date="2026-10-02").exists()


@pytest.mark.django_db
def test_admin_rejects_duplicate_unlock_order_without_a_500(staff_client, song):
    # The DB-level UniqueConstraint (Task 1) is the backstop, but a raw
    # IntegrityError surfacing as an unhandled 500 would be a bad admin
    # experience for the one person who uses this daily — the formset
    # must catch it as a clean validation error instead.
    data = {
        "date": "2026-10-02",
        "song": song.pk,
        "state": DailySong.DRAFT,
        "stems-TOTAL_FORMS": "4",
        "stems-INITIAL_FORMS": "0",
        "stems-MIN_NUM_FORMS": "0",
        "stems-MAX_NUM_FORMS": "4",
    }
    files = {}
    for i, (stem_type, _) in enumerate(Stem.STEM_TYPE_CHOICES):
        data[f"stems-{i}-stem_type"] = stem_type
        data[f"stems-{i}-unlock_order"] = "1"  # every stem claims order 1
        files[f"stems-{i}-audio_file"] = _stem_file(f"{stem_type}.mp3")

    response = staff_client.post(
        reverse("admin:gameplay_dailysong_add"), {**data, **files}, follow=True
    )

    assert response.status_code == 200  # not a 500
    assert not DailySong.objects.filter(date="2026-10-02").exists()
