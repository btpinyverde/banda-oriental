# Gameplay Models + Admin + R2 Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Brandon a working admin flow to define the day's song and upload its 4 stems to real Cloudflare R2 storage, backed by the gameplay data model the API (next plan) will read from. No API endpoints yet — that's Plan 3b.

**Architecture:** A new `gameplay` Django app with `DailySong` (one per calendar date, points at a `catalog.Song`), `Stem` (4 per `DailySong`, audio files stored in Cloudflare R2 via `django-storages`), `GuessAttempt` and `ScoreEntry` (empty of behavior in this plan — just the tables Plan 3b's API will write to, so the schema exists before the logic that needs it). The admin gets an inline formset so Brandon uploads all 4 stems on the same page where he picks the song and date.

**Tech Stack:** Django 5.1, `django-storages[s3]` + `boto3` for R2 (S3-compatible API), pytest + pytest-django. R2 bucket `banda-oriental-stems` and a scoped API token already exist (created directly in Cloudflare's dashboard; credentials are in Render's env vars as `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME`/`R2_ENDPOINT_URL`, not committed).

**Spec:** `docs/superpowers/specs/2026-10-02-banda-oriental-design.md` (sections 4, 10, 13)

## Global Constraints

- `Stem.audio_file` must go through R2 (`django-storages`), never local disk — Render's free-tier filesystem is ephemeral, a file saved there vanishes on the next deploy.
- The R2 bucket is private (`Public Access: Disabled`, confirmed when it was created) — files are only ever reachable through signed URLs the storage backend generates, never a public bucket URL.
- Exactly 4 stems per `DailySong`, each with a distinct `unlock_order` from 1-4 — this is enforced at the database level (a unique constraint), not just in the admin form, since the API (Plan 3b) depends on this invariant always holding.
- `DailySong.date` is unique — there is at most one song per calendar date, ever.
- No R2 credentials, or any other secret, in committed code — settings read them from `os.environ`, same pattern as every other secret in this project so far.

## Review Focus

- Uploading fewer or more than 4 stems, or two stems with the same `unlock_order`, must be rejected — by the database constraint at minimum, and ideally by the admin form before it even tries to save.
- A `DailySong` in `draft` state must not be distinguishable from `published` by anything in this plan's scope except the field itself — Plan 3b's API is what actually enforces "don't serve draft songs," this plan only needs the field to exist and be set correctly from the admin.
- The storage backend config must not silently fall back to local disk if an R2 env var is missing or empty — a wrong/missing credential should fail loudly when someone actually tries to upload, not pretend to work and then lose the file on the next deploy.
- Tests must never make a real network call to R2 — the storage backend itself is swapped for a stub/local backend in tests (same philosophy as Plan 2: real external systems get exercised once, manually, not on every test run).

---

### Task 1: `gameplay` app and models

**Files:**
- Create: `backend/gameplay/__init__.py`
- Create: `backend/gameplay/apps.py`
- Create: `backend/gameplay/models.py`
- Create: `backend/gameplay/migrations/__init__.py`
- Modify: `backend/config/settings/base.py`
- Test: `backend/gameplay/tests/__init__.py`
- Test: `backend/gameplay/tests/test_models.py`

**Interfaces:**
- Produces: `gameplay.models.DailySong(date, song, state)` (`state` is `"draft"` or `"published"`, default `"draft"`), `gameplay.models.Stem(daily_song, stem_type, unlock_order, audio_file)`, `gameplay.models.GuessAttempt(device_id, daily_song, attempt_number, guessed_text, is_correct, feedback, created_at)`, `gameplay.models.ScoreEntry(device_id, daily_song, display_name, score, winning_attempt, total_time_seconds, created_at)` — all consumed by Task 3 (admin) and by Plan 3b (API).
- Consumes: `catalog.models.Song` (from the catalog plan, already on `main`).

- [ ] **Step 1: Write the failing tests**

```python
# backend/gameplay/tests/test_models.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/ -v`
Expected: `ModuleNotFoundError: No module named 'gameplay'`.

- [ ] **Step 3: Write the app skeleton and models**

```python
# backend/gameplay/__init__.py
```

```python
# backend/gameplay/apps.py
from django.apps import AppConfig


class GameplayConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "gameplay"
```

```python
# backend/gameplay/migrations/__init__.py
```

```python
# backend/gameplay/tests/__init__.py
```

```python
# backend/gameplay/models.py
from django.core.files.storage import storages
from django.db import models

from catalog.models import Song


class DailySong(models.Model):
    DRAFT = "draft"
    PUBLISHED = "published"
    STATE_CHOICES = [(DRAFT, "Borrador"), (PUBLISHED, "Publicado")]

    date = models.DateField(unique=True)
    song = models.ForeignKey(Song, on_delete=models.PROTECT, related_name="daily_appearances")
    state = models.CharField(max_length=10, choices=STATE_CHOICES, default=DRAFT)

    def __str__(self):
        return f"{self.date} — {self.song.title}"


def stem_upload_path(instance, filename):
    return f"stems/{instance.daily_song.date.isoformat()}/{instance.stem_type}-{filename}"


def get_stems_storage():
    # A function, not a direct reference, so Django resolves the "stems"
    # entry from STORAGES at save/access time — not at import time, before
    # settings (and tests' override of this setting) are fully loaded.
    return storages["stems"]


class Stem(models.Model):
    DRUMS = "drums"
    BASS = "bass"
    VOCALS = "vocals"
    OTHER = "other"
    STEM_TYPE_CHOICES = [
        (DRUMS, "Batería"),
        (BASS, "Bajo"),
        (VOCALS, "Voz"),
        (OTHER, "Otros"),
    ]

    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="stems")
    stem_type = models.CharField(max_length=10, choices=STEM_TYPE_CHOICES)
    unlock_order = models.PositiveSmallIntegerField()
    audio_file = models.FileField(upload_to=stem_upload_path, storage=get_stems_storage)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["daily_song", "unlock_order"], name="unique_unlock_order_per_day"
            ),
        ]
        ordering = ["unlock_order"]

    def __str__(self):
        return f"{self.daily_song} — {self.get_stem_type_display()} (#{self.unlock_order})"


class GuessAttempt(models.Model):
    device_id = models.CharField(max_length=64)
    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="attempts")
    attempt_number = models.PositiveSmallIntegerField()
    guessed_text = models.CharField(max_length=255)
    is_correct = models.BooleanField()
    feedback = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["attempt_number"]


class ScoreEntry(models.Model):
    device_id = models.CharField(max_length=64)
    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="scores")
    display_name = models.CharField(max_length=50)
    score = models.PositiveIntegerField()
    winning_attempt = models.PositiveSmallIntegerField()
    total_time_seconds = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["device_id", "daily_song"], name="one_score_per_device_per_day"
            ),
        ]
```

Add `"gameplay"` to `INSTALLED_APPS` in `backend/config/settings/base.py` (after `"catalog"`).

- [ ] **Step 4: Generate the migration**

Run: `cd backend && ./.venv/bin/python manage.py makemigrations gameplay`
Expected: creates `backend/gameplay/migrations/0001_initial.py` with all 4 models and both unique constraints.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/ catalog/ core/ -v`
Expected: all tests `PASS`. (This will fail right now with a storage-related error because `STORAGES["stems"]` doesn't exist yet — that's Task 2. If Task 1's tests need to pass in isolation, temporarily stub `STORAGES["stems"]` in `base.py` with `django.core.files.storage.FileSystemStorage` and let Task 2 replace it with the real R2 backend — do this rather than skip Task 1's tests.)

```python
# backend/config/settings/base.py — add temporarily in Task 1, replaced in Task 2
STORAGES.setdefault("stems", {"BACKEND": "django.core.files.storage.FileSystemStorage"})
```

- [ ] **Step 6: Commit**

```bash
git add backend/gameplay/ backend/config/settings/base.py
git commit -m "feat(backend): add gameplay models (DailySong, Stem, GuessAttempt, ScoreEntry)"
```

---

### Task 2: Cloudflare R2 storage wiring

**Files:**
- Modify: `backend/config/settings/base.py`
- Modify: `backend/requirements.txt`
- Modify: `backend/.env.example`
- Test: `backend/gameplay/tests/test_storage.py`

**Interfaces:**
- Produces: `STORAGES["stems"]` configured as a private, signed-URL S3-compatible backend pointed at Cloudflare R2 — consumed by `Stem.audio_file` (Task 1) and, implicitly, by anything that later needs to read a stem's URL (Plan 3b).

- [ ] **Step 1: Write the failing test**

```python
# backend/gameplay/tests/test_storage.py
from django.conf import settings


def test_stems_storage_points_at_r2_not_local_disk():
    stems_config = settings.STORAGES["stems"]
    assert stems_config["BACKEND"] == "storages.backends.s3.S3Storage"
    assert stems_config["OPTIONS"]["bucket_name"] == settings.R2_BUCKET_NAME
    assert stems_config["OPTIONS"]["endpoint_url"] == settings.R2_ENDPOINT_URL
    # Private bucket (confirmed when it was created in Cloudflare's
    # dashboard) — every URL must be signed, never a bare public link.
    assert stems_config["OPTIONS"]["querystring_auth"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_storage.py -v`
Expected: `AttributeError` or `KeyError` — `STORAGES["stems"]` is still the `FileSystemStorage` stub from Task 1, and `settings.R2_BUCKET_NAME` doesn't exist yet.

- [ ] **Step 3: Wire the real R2 backend**

Edit `backend/config/settings/base.py` — replace the Task 1 stub:

```python
# backend/config/settings/base.py — replaces the Task 1 STORAGES stub
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "")
R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL", "")

STORAGES["stems"] = {
    "BACKEND": "storages.backends.s3.S3Storage",
    "OPTIONS": {
        "access_key": R2_ACCESS_KEY_ID,
        "secret_key": R2_SECRET_ACCESS_KEY,
        "bucket_name": R2_BUCKET_NAME,
        "endpoint_url": R2_ENDPOINT_URL,
        "region_name": "auto",
        "querystring_auth": True,
        "default_acl": None,
        "signature_version": "s3v4",
        "querystring_expire": 3600,
    },
}
```

Add `"storages"` to `INSTALLED_APPS` in the same file.

Add to `backend/requirements.txt`:

```
django-storages[s3]==1.14.4
```

Add to `backend/.env.example`:

```
R2_ACCESS_KEY_ID=change-me
R2_SECRET_ACCESS_KEY=change-me
R2_BUCKET_NAME=banda-oriental-stems
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/pip install -r requirements.txt && ./.venv/bin/python -m pytest gameplay/ catalog/ core/ -v`
Expected: all tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/config/settings/base.py backend/requirements.txt backend/.env.example
git commit -m "feat(backend): wire Stem storage to Cloudflare R2"
```

---

### Task 3: Admin for DailySong with inline stem uploads

**Files:**
- Create: `backend/gameplay/admin.py`
- Modify: `backend/gameplay/models.py`
- Test: `backend/gameplay/tests/test_admin.py`

**Interfaces:**
- Produces: a Django admin page at `/admin/gameplay/dailysong/add/` where Brandon picks a `Song`, a date, and uploads 4 stems with their unlock order in one inline formset — this is the only way `DailySong`/`Stem` rows get created from here on (the API in Plan 3b only reads them).

- [ ] **Step 1: Write the failing test**

```python
# backend/gameplay/tests/test_admin.py
from io import BytesIO

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
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


def _stem_file(name):
    return SimpleUploadedFile(name, BytesIO(b"fake audio bytes").read(), content_type="audio/mpeg")


@pytest.mark.django_db
@override_settings(STORAGES={
    **{"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    "stems": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
})
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
@override_settings(STORAGES={
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    "stems": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
})
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
@override_settings(STORAGES={
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    "stems": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
})
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_admin.py -v`
Expected: `ModuleNotFoundError: No module named 'gameplay.admin'` (or a 404/`NoReverseMatch` once a bare `admin.py` exists but nothing is registered — either way, both tests fail before the admin is wired).

- [ ] **Step 3: Write the admin**

Add a `clean()` method to `Stem` first, so both the admin formset and any
future direct use of the model enforce "exactly 4, unlock_order 1-4" at the
same layer:

```python
# backend/gameplay/models.py — add to the Stem class, after Meta
    def __str__(self):
        return f"{self.daily_song} — {self.get_stem_type_display()} (#{self.unlock_order})"
```

(No model-level change needed beyond what Task 1 already wrote — the "exactly
4" rule is a formset-level rule, enforced in the admin below via
`min_num`/`max_num`/`validate_min`/`validate_max`, not a single model's own
`clean()`.)

```python
# backend/gameplay/admin.py
from django.contrib import admin

from .models import DailySong, Stem


class StemInline(admin.TabularInline):
    model = Stem
    extra = 4
    min_num = 4
    max_num = 4
    validate_min = True
    validate_max = True


@admin.register(DailySong)
class DailySongAdmin(admin.ModelAdmin):
    list_display = ("date", "song", "state")
    list_filter = ("state",)
    date_hierarchy = "date"
    inlines = [StemInline]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/ catalog/ core/ -v`
Expected: all tests `PASS`, including `test_admin_rejects_duplicate_unlock_order_without_a_500`.

**If that one test fails with a 500** (Django's inline-formset unique
validation doesn't always catch a `UniqueConstraint` shared with the
parent FK the way plain `unique_together` does — confirm which case this
is empirically rather than assuming): add an explicit check in
`StemInline` rather than relying on the database constraint alone:

```python
# backend/gameplay/admin.py — only add this if the test above actually fails
from django import forms


class StemInlineFormSet(forms.BaseInlineFormSet):
    def clean(self):
        super().clean()
        orders = [
            form.cleaned_data["unlock_order"]
            for form in self.forms
            if form.cleaned_data and not form.cleaned_data.get("DELETE")
        ]
        if len(orders) != len(set(orders)):
            raise forms.ValidationError("Cada stem necesita un unlock_order distinto (1-4).")


class StemInline(admin.TabularInline):
    model = Stem
    formset = StemInlineFormSet
    extra = 4
    min_num = 4
    max_num = 4
    validate_min = True
    validate_max = True
```

- [ ] **Step 5: Manual verification against real R2 (not mocked)**

Run `./.venv/bin/python manage.py runserver`, log in at `http://localhost:8000/admin/`
(use `./.venv/bin/python manage.py createsuperuser` first if you don't have a local one),
go to Gameplay → Daily songs → Add, pick any synced song, today's date, and
upload 4 small real audio files (or any 4 files — they don't need to be real
stems yet) as the 4 inline stems. Save.

Expected: it saves without error. Then check the Cloudflare R2 dashboard
(R2 Object Storage → banda-oriental-stems) — the 4 files should appear
under `stems/<today's date>/`.

- [ ] **Step 6: Commit**

```bash
git add backend/gameplay/admin.py backend/gameplay/tests/test_admin.py
git commit -m "feat(backend): add DailySong admin with inline stem uploads to R2"
```
