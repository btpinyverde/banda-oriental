# Catalog + MusicBrainz Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate a `catalog` of Uruguayan artists/albums/songs from the real MusicBrainz + Cover Art Archive APIs via an idempotent sync command, triggerable by Brandon from the Django admin — no cron, no background worker.

**Architecture:** A new `catalog` Django app with three content models (`Artist`, `Album`, `Song`, keyed by MusicBrainz ID for idempotent upsert) plus a tiny `SyncState` model that remembers how far through MusicBrainz's artist list the last sync got. Two thin API-client modules (`catalog/musicbrainz.py`, `catalog/coverartarchive.py`) wrap the real HTTP APIs; a management command orchestrates them. The Django admin (newly enabled in this plan — Plan 1 deliberately shipped without it) exposes a custom admin action that runs a *bounded* batch of the sync synchronously inside the request, because there is no background worker and Render's free tier will kill a request that runs too long.

**Tech Stack:** Django 5.1 (adds `contrib.admin`/`auth`/`sessions`/`messages`), `requests` for HTTP, `whitenoise` to serve the admin's static assets in production, pytest + `unittest.mock` for tests (no real network calls in the suite — all fixtures below were captured from the live APIs on 2026-10-02 so they match the real response shape).

**Spec:** `docs/superpowers/specs/2026-10-02-banda-oriental-design.md` (sections 3, 4, 5, 10, 13)

## Global Constraints

- All new MusicBrainz/Cover Art Archive HTTP calls go through `catalog/musicbrainz.py` / `catalog/coverartarchive.py` — never call `requests` directly from the management command or the admin.
- Every outbound MusicBrainz request sets `User-Agent: BandaOriental/0.1 ( https://github.com/btpinyverde/banda-oriental )` and is throttled to at most 1 request/second (MusicBrainz's documented limit without an API key).
- `Artist.mbid`, `Album.mbid`, `Song.mbid` are the upsert keys everywhere — re-running the sync must never create duplicates.
- No background worker, no Celery, no cron (per spec §13 — GitHub Actions was ruled out, and the architecture never planned on Celery/Redis either). The admin action must complete inside one HTTP request.
- The admin must actually render in production on Render — static assets served via whitenoise, not left to 404.

## Review Focus

- MusicBrainz returns sparse data for most fields (empty `genres`, missing `first-release-date`, releases with no cover art) → the sync must save what exists and move on, never crash on a missing field.
- Running `sync_musicbrainz` twice on the same data must produce zero duplicate rows and update changed fields (e.g. a newly-added Instagram handle must survive a re-sync that didn't touch that artist).
- The admin's "Sincronizar" action must never run an unbounded batch — it must stay within a small, fixed `--limit` so it can't time out the request (Render's free tier has no background worker to hand this off to).
- A deploy with `DJANGO_SUPERUSER_PASSWORD` unset must not break the build (unlike the hard-fail settings from Plan 1, creating an admin login is not as load-bearing as DB connectivity) — `ensure_superuser` must skip quietly, not crash `collectstatic`/`migrate`.
- The rate limiter must actually throttle — a test must prove consecutive MusicBrainz calls sleep, not just that the client "looks like" it respects the limit.

---

### Task 1: `catalog` app, models, and Django admin bootstrap

**Files:**
- Create: `backend/catalog/__init__.py`
- Create: `backend/catalog/apps.py`
- Create: `backend/catalog/models.py`
- Create: `backend/catalog/admin.py`
- Create: `backend/catalog/migrations/__init__.py`
- Create: `backend/catalog/management/__init__.py`
- Create: `backend/catalog/management/commands/__init__.py`
- Create: `backend/catalog/management/commands/ensure_superuser.py`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/urls.py`
- Modify: `backend/requirements.txt`
- Modify: `render.yaml`
- Test: `backend/catalog/tests/__init__.py`
- Test: `backend/catalog/tests/test_models.py`
- Test: `backend/catalog/tests/test_ensure_superuser.py`

**Interfaces:**
- Produces: `catalog.models.Artist(mbid, name, instagram_handle)`, `catalog.models.Album(mbid, name, artist, year, genre, cover_art_url)`, `catalog.models.Song(mbid, title, album, duration_seconds)`, `catalog.models.SyncState(musicbrainz_offset)` (singleton, `pk=1`) — consumed by Task 4's sync command.
- Produces: `/admin/` reachable and rendering with static assets in production.

- [ ] **Step 1: Write the failing model tests**

```python
# backend/catalog/tests/test_models.py
import pytest
from django.db import IntegrityError

from catalog.models import Album, Artist, Song, SyncState


@pytest.mark.django_db
def test_artist_mbid_is_unique():
    Artist.objects.create(mbid="abb91078-f7db-41f2-8f07-7f37bb739143", name="Jorge Drexler")
    with pytest.raises(IntegrityError):
        Artist.objects.create(mbid="abb91078-f7db-41f2-8f07-7f37bb739143", name="Duplicate")


@pytest.mark.django_db
def test_album_links_to_artist_and_allows_sparse_fields():
    artist = Artist.objects.create(mbid="artist-mbid", name="Jorge Drexler")
    album = Album.objects.create(
        mbid="92a52b9a-855e-364d-a552-ecf29a5a4200",
        name="Vaivén",
        artist=artist,
        year=None,
        genre="",
        cover_art_url="",
    )
    assert album.artist == artist
    assert artist.albums.get() == album


@pytest.mark.django_db
def test_song_links_to_album_and_duration_is_optional():
    artist = Artist.objects.create(mbid="artist-mbid", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-mbid", name="Vaivén", artist=artist)
    song = Song.objects.create(
        mbid="df8b85ee-61f7-47af-baa0-3864546bd686",
        title="Luna negra",
        album=album,
        duration_seconds=None,
    )
    assert song.album == album


@pytest.mark.django_db
def test_sync_state_get_or_create_defaults_to_offset_zero():
    state = SyncState.get_solo()
    assert state.musicbrainz_offset == 0
```

- [ ] **Step 2: Write the failing ensure_superuser tests**

```python
# backend/catalog/tests/test_ensure_superuser.py
import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

User = get_user_model()


@pytest.mark.django_db
def test_ensure_superuser_creates_one_from_env(monkeypatch):
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", "brandon@example.com")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "a-real-password")
    call_command("ensure_superuser")
    user = User.objects.get(email="brandon@example.com")
    assert user.is_superuser
    assert user.is_staff


@pytest.mark.django_db
def test_ensure_superuser_is_idempotent(monkeypatch):
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", "brandon@example.com")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "a-real-password")
    call_command("ensure_superuser")
    call_command("ensure_superuser")
    assert User.objects.filter(email="brandon@example.com").count() == 1


@pytest.mark.django_db
def test_ensure_superuser_skips_quietly_without_env(monkeypatch, capsys):
    monkeypatch.delenv("DJANGO_SUPERUSER_EMAIL", raising=False)
    monkeypatch.delenv("DJANGO_SUPERUSER_PASSWORD", raising=False)
    call_command("ensure_superuser")  # must not raise
    assert User.objects.count() == 0
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/ -v`
Expected: `ModuleNotFoundError: No module named 'catalog'`.

- [ ] **Step 4: Write the app skeleton, models, admin, and settings wiring**

```python
# backend/catalog/__init__.py
```

```python
# backend/catalog/apps.py
from django.apps import AppConfig


class CatalogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "catalog"
```

```python
# backend/catalog/models.py
from django.db import models


class Artist(models.Model):
    mbid = models.CharField(max_length=36, unique=True)
    name = models.CharField(max_length=255)
    instagram_handle = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return self.name


class Album(models.Model):
    mbid = models.CharField(max_length=36, unique=True)
    name = models.CharField(max_length=255)
    artist = models.ForeignKey(Artist, on_delete=models.CASCADE, related_name="albums")
    year = models.IntegerField(null=True, blank=True)
    genre = models.CharField(max_length=100, blank=True)
    cover_art_url = models.URLField(blank=True)

    def __str__(self):
        return self.name


class Song(models.Model):
    mbid = models.CharField(max_length=36, unique=True)
    title = models.CharField(max_length=255)
    album = models.ForeignKey(Album, on_delete=models.CASCADE, related_name="songs")
    duration_seconds = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return self.title


class SyncState(models.Model):
    """Singleton (always pk=1): remembers where the last sync left off in
    MusicBrainz's artist search results, so a bounded admin-triggered sync
    makes forward progress across multiple clicks instead of re-processing
    the same first page every time."""

    musicbrainz_offset = models.PositiveIntegerField(default=0)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
```

```python
# backend/catalog/migrations/__init__.py
```

```python
# backend/catalog/admin.py
from django.contrib import admin

from .models import Album, Artist, Song


@admin.register(Artist)
class ArtistAdmin(admin.ModelAdmin):
    list_display = ("name", "mbid", "instagram_handle")
    search_fields = ("name",)


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ("name", "artist", "year", "genre")
    list_filter = ("year",)
    search_fields = ("name",)


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ("title", "album", "duration_seconds")
    search_fields = ("title",)
```

```python
# backend/catalog/management/__init__.py
```

```python
# backend/catalog/management/commands/__init__.py
```

```python
# backend/catalog/management/commands/ensure_superuser.py
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    """Creates a superuser from DJANGO_SUPERUSER_EMAIL/PASSWORD if one with
    that email doesn't exist yet. Safe to run on every deploy. Unlike the
    hard-fail settings checks, a missing admin login isn't worth breaking
    the build over — it just means nobody can log in yet."""

    help = "Ensure a superuser exists, from env vars, without crashing if they're unset."

    def handle(self, *args, **options):
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
        if not email or not password:
            self.stdout.write("DJANGO_SUPERUSER_EMAIL/PASSWORD not set, skipping.")
            return
        if User.objects.filter(email=email).exists():
            self.stdout.write(f"Superuser {email} already exists, skipping.")
            return
        User.objects.create_superuser(username=email, email=email, password=password)
        self.stdout.write(f"Created superuser {email}.")
```

```python
# backend/catalog/tests/__init__.py
```

Now wire it into settings. Edit `backend/config/settings/base.py`:

```python
# backend/config/settings/base.py
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "core",
    "catalog",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

LANGUAGE_CODE = "es-uy"
TIME_ZONE = "America/Montevideo"
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# No login for *players* in this project (see spec): DRF's default
# authentication classes touch django.contrib.auth.models on request.user,
# which would otherwise import AnonymousUser. The admin (staff-only,
# session-based) is unaffected by this — it's a separate auth path DRF
# doesn't touch.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
```

> **Note:** `django.contrib.auth` is now installed (it wasn't in Plan 1 —
> see that plan's ruling about `UNAUTHENTICATED_USER`). This doesn't
> reopen that ruling: DRF's `request.user` still never touches it because
> `UNAUTHENTICATED_USER` stays `None`; auth is only used by the
> session-based admin login now, a completely separate code path.

Edit `backend/config/urls.py`:

```python
# backend/config/urls.py
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
]
```

Edit `backend/requirements.txt` — add two lines:

```
# backend/requirements.txt
Django==5.1.3
djangorestframework==3.15.2
dj-database-url==2.3.0
psycopg[binary]==3.2.3
gunicorn==23.0.0
django-cors-headers==4.4.0
whitenoise==6.8.2
requests==2.32.3
```

Edit `render.yaml` — add the superuser env vars:

```yaml
# render.yaml
services:
  - type: web
    name: banda-oriental-backend
    runtime: python
    plan: free
    rootDir: backend
    buildCommand: "pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate && python manage.py ensure_superuser"
    startCommand: "gunicorn config.wsgi:application"
    envVars:
      - key: PYTHON_VERSION
        value: "3.12.7"
      - key: DJANGO_SETTINGS_MODULE
        value: config.settings.prod
      - key: SECRET_KEY
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: ALLOWED_HOSTS
        sync: false
      - key: CORS_ALLOWED_ORIGINS
        sync: false
      - key: DJANGO_SUPERUSER_EMAIL
        sync: false
      - key: DJANGO_SUPERUSER_PASSWORD
        sync: false
```

- [ ] **Step 5: Generate the migration**

Run: `cd backend && ./.venv/bin/pip install -r requirements.txt && ./.venv/bin/python manage.py makemigrations catalog`
Expected: creates `backend/catalog/migrations/0001_initial.py` with `Artist`, `Album`, `Song`, `SyncState`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/ core/ -v`
Expected: all tests `PASS` (the full suite, not just `catalog/`, since `INSTALLED_APPS`/`MIDDLEWARE` changed and could have broken `core`'s tests).

- [ ] **Step 7: Verify the admin actually renders locally**

Run: `cd backend && ./.venv/bin/python manage.py runserver` then visit `http://localhost:8000/admin/` in a browser.
Expected: the Django admin login page renders with its CSS (not an unstyled HTML form) — confirms `APP_DIRS`/admin templates are wired correctly even before whitenoise matters (whitenoise only matters once `DEBUG=False`).

- [ ] **Step 8: Commit**

```bash
git add backend/ render.yaml
git commit -m "feat(backend): add catalog app, models, and Django admin"
```

---

### Task 2: MusicBrainz API client

**Files:**
- Create: `backend/catalog/musicbrainz.py`
- Test: `backend/catalog/tests/test_musicbrainz.py`

**Interfaces:**
- Produces: `search_uruguayan_artists(offset: int, limit: int = 25) -> tuple[list[dict], int]` — returns `(artists, total_count)`, each artist dict has `mbid` and `name`.
- Produces: `get_album_release_groups(artist_mbid: str) -> list[dict]` — each has `mbid`, `title`, `year` (`int | None`), `genre` (`str`, possibly empty).
- Produces: `get_release_for_release_group(release_group_mbid: str) -> dict | None` — `{"mbid": ..., "has_cover_art": bool}`, or `None` if the release-group has no releases.
- Produces: `get_tracklist(release_mbid: str) -> list[dict]` — each has `mbid`, `title`, `duration_seconds` (`int | None`).
- Consumed by: Task 4's sync command.

- [ ] **Step 1: Write the failing tests**

These fixtures are trimmed real responses captured from the live API on
2026-10-02 (`curl https://musicbrainz.org/ws/2/artist?query=country:UY&fmt=json`
etc.) — not guessed shapes.

```python
# backend/catalog/tests/test_musicbrainz.py
from unittest.mock import MagicMock, patch

from catalog.musicbrainz import (
    get_album_release_groups,
    get_release_for_release_group,
    get_tracklist,
    search_uruguayan_artists,
)

ARTIST_SEARCH_RESPONSE = {
    "count": 1040,
    "offset": 0,
    "artists": [
        {"id": "b8468bc4-a202-4c2a-ba1e-7dc75d9cbcf0", "name": "Leo Masliah", "country": "UY"},
        {"id": "abb91078-f7db-41f2-8f07-7f37bb739143", "name": "Jorge Drexler", "country": "UY"},
    ],
}

RELEASE_GROUPS_RESPONSE = {
    "release-group-count": 17,
    "release-group-offset": 0,
    "release-groups": [
        {
            "id": "92a52b9a-855e-364d-a552-ecf29a5a4200",
            "title": "Vaivén",
            "first-release-date": "1996",
            "primary-type": "Album",
            "genres": [],
        },
        {
            "id": "no-date-mbid",
            "title": "Untitled Demo",
            "first-release-date": "",
            "primary-type": "Album",
            "genres": [{"name": "singer-songwriter"}],
        },
    ],
}

RELEASES_RESPONSE = {
    "release-count": 1,
    "releases": [
        {
            "id": "9e80a911-a74a-4290-aa8a-159fb97351ad",
            "cover-art-archive": {"front": True, "back": False, "artwork": True, "count": 1},
        }
    ],
}

RELEASES_RESPONSE_NO_RELEASES = {"release-count": 0, "releases": []}

RELEASE_WITH_RECORDINGS_RESPONSE = {
    "title": "Vaivén",
    "media": [
        {
            "tracks": [
                {
                    "number": "1",
                    "title": "Luna negra",
                    "length": 186493,
                    "recording": {"id": "df8b85ee-61f7-47af-baa0-3864546bd686"},
                },
                {
                    "number": "2",
                    "title": "Sin duración",
                    "recording": {"id": "no-length-mbid"},
                },
            ]
        }
    ],
}


def _mock_response(json_body):
    response = MagicMock()
    response.json.return_value = json_body
    response.raise_for_status.return_value = None
    return response


@patch("catalog.musicbrainz._get")
def test_search_uruguayan_artists_parses_id_and_name(mock_get):
    mock_get.return_value = _mock_response(ARTIST_SEARCH_RESPONSE)
    artists, total = search_uruguayan_artists(offset=0, limit=25)
    assert total == 1040
    assert artists == [
        {"mbid": "b8468bc4-a202-4c2a-ba1e-7dc75d9cbcf0", "name": "Leo Masliah"},
        {"mbid": "abb91078-f7db-41f2-8f07-7f37bb739143", "name": "Jorge Drexler"},
    ]
    called_path, called_params = mock_get.call_args[0]
    assert called_path == "artist"
    assert called_params == {"query": "country:UY", "offset": 0, "limit": 25}


@patch("catalog.musicbrainz._get")
def test_get_album_release_groups_parses_year_and_handles_missing_genre(mock_get):
    mock_get.return_value = _mock_response(RELEASE_GROUPS_RESPONSE)
    groups = get_album_release_groups("abb91078-f7db-41f2-8f07-7f37bb739143")
    assert groups[0] == {
        "mbid": "92a52b9a-855e-364d-a552-ecf29a5a4200",
        "title": "Vaivén",
        "year": 1996,
        "genre": "",
    }
    assert groups[1] == {
        "mbid": "no-date-mbid",
        "title": "Untitled Demo",
        "year": None,
        "genre": "singer-songwriter",
    }


@patch("catalog.musicbrainz._get")
def test_get_release_for_release_group_reports_cover_art_availability(mock_get):
    mock_get.return_value = _mock_response(RELEASES_RESPONSE)
    release = get_release_for_release_group("92a52b9a-855e-364d-a552-ecf29a5a4200")
    assert release == {"mbid": "9e80a911-a74a-4290-aa8a-159fb97351ad", "has_cover_art": True}


@patch("catalog.musicbrainz._get")
def test_get_release_for_release_group_returns_none_when_no_releases(mock_get):
    mock_get.return_value = _mock_response(RELEASES_RESPONSE_NO_RELEASES)
    assert get_release_for_release_group("empty-mbid") is None


@patch("catalog.musicbrainz._get")
def test_get_tracklist_parses_tracks_and_handles_missing_length(mock_get):
    mock_get.return_value = _mock_response(RELEASE_WITH_RECORDINGS_RESPONSE)
    tracks = get_tracklist("9e80a911-a74a-4290-aa8a-159fb97351ad")
    assert tracks == [
        {
            "mbid": "df8b85ee-61f7-47af-baa0-3864546bd686",
            "title": "Luna negra",
            "duration_seconds": 186,
        },
        {
            "mbid": "no-length-mbid",
            "title": "Sin duración",
            "duration_seconds": None,
        },
    ]


@patch("catalog.musicbrainz.time.sleep")
@patch("catalog.musicbrainz.requests.get")
def test_consecutive_requests_are_rate_limited(mock_requests_get, mock_sleep):
    # Patches requests.get (not _get) so _throttle()'s real logic runs —
    # patching _get itself would bypass the throttle entirely and prove
    # nothing.
    mock_requests_get.return_value = _mock_response(ARTIST_SEARCH_RESPONSE)
    search_uruguayan_artists(offset=0, limit=25)
    search_uruguayan_artists(offset=25, limit=25)
    assert mock_sleep.called
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/tests/test_musicbrainz.py -v`
Expected: `ModuleNotFoundError: No module named 'catalog.musicbrainz'`.

- [ ] **Step 3: Write the client**

```python
# backend/catalog/musicbrainz.py
import time

import requests

BASE_URL = "https://musicbrainz.org/ws/2"
USER_AGENT = "BandaOriental/0.1 ( https://github.com/btpinyverde/banda-oriental )"

_last_request_at = 0.0
_MIN_INTERVAL_SECONDS = 1.0


def _throttle():
    global _last_request_at
    elapsed = time.time() - _last_request_at
    if elapsed < _MIN_INTERVAL_SECONDS:
        time.sleep(_MIN_INTERVAL_SECONDS - elapsed)
    _last_request_at = time.time()


def _get(path, params):
    _throttle()
    response = requests.get(
        f"{BASE_URL}/{path}",
        params={**params, "fmt": "json"},
        headers={"User-Agent": USER_AGENT},
        timeout=10,
    )
    response.raise_for_status()
    return response


def search_uruguayan_artists(offset, limit=25):
    response = _get("artist", {"query": "country:UY", "offset": offset, "limit": limit})
    data = response.json()
    artists = [{"mbid": a["id"], "name": a["name"]} for a in data["artists"]]
    return artists, data["count"]


def get_album_release_groups(artist_mbid):
    response = _get(
        "release-group",
        {"artist": artist_mbid, "type": "album", "limit": 100, "inc": "genres"},
    )
    data = response.json()
    groups = []
    for rg in data["release-groups"]:
        date = rg.get("first-release-date") or ""
        year = int(date[:4]) if date[:4].isdigit() else None
        genres = rg.get("genres") or []
        genre = genres[0]["name"] if genres else ""
        groups.append({"mbid": rg["id"], "title": rg["title"], "year": year, "genre": genre})
    return groups


def get_release_for_release_group(release_group_mbid):
    response = _get("release", {"release-group": release_group_mbid, "limit": 1})
    data = response.json()
    releases = data["releases"]
    if not releases:
        return None
    release = releases[0]
    has_cover_art = bool(release.get("cover-art-archive", {}).get("front"))
    return {"mbid": release["id"], "has_cover_art": has_cover_art}


def get_tracklist(release_mbid):
    response = _get(f"release/{release_mbid}", {"inc": "recordings"})
    data = response.json()
    tracks = []
    for medium in data.get("media", []):
        for track in medium.get("tracks", []):
            length_ms = track.get("length")
            duration_seconds = length_ms // 1000 if length_ms else None
            tracks.append(
                {
                    "mbid": track["recording"]["id"],
                    "title": track["title"],
                    "duration_seconds": duration_seconds,
                }
            )
    return tracks
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/tests/test_musicbrainz.py -v`
Expected: all tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/catalog/musicbrainz.py backend/catalog/tests/test_musicbrainz.py
git commit -m "feat(backend): add MusicBrainz API client with rate limiting"
```

---

### Task 3: Cover Art Archive client

**Files:**
- Create: `backend/catalog/coverartarchive.py`
- Test: `backend/catalog/tests/test_coverartarchive.py`

**Interfaces:**
- Produces: `get_cover_art_url(release_mbid: str) -> str` — returns the 500px thumbnail URL, or `""` if there's no cover art (404) or no "front" image.
- Consumed by: Task 4's sync command.

- [ ] **Step 1: Write the failing tests**

```python
# backend/catalog/tests/test_coverartarchive.py
from unittest.mock import MagicMock, patch

import requests

from catalog.coverartarchive import get_cover_art_url

COVER_ART_RESPONSE = {
    "images": [
        {
            "front": True,
            "image": "https://coverartarchive.org/release/9e80a911/full.jpg",
            "thumbnails": {
                "250": "https://coverartarchive.org/release/9e80a911/full-250.jpg",
                "500": "https://coverartarchive.org/release/9e80a911/full-500.jpg",
            },
        }
    ],
    "release": "https://musicbrainz.org/release/9e80a911-a74a-4290-aa8a-159fb97351ad",
}

COVER_ART_RESPONSE_NO_FRONT = {
    "images": [
        {
            "front": False,
            "back": True,
            "image": "https://coverartarchive.org/release/x/full.jpg",
            "thumbnails": {"500": "https://coverartarchive.org/release/x/back-500.jpg"},
        }
    ],
    "release": "https://musicbrainz.org/release/x",
}


@patch("catalog.coverartarchive.requests.get")
def test_get_cover_art_url_returns_500px_front_thumbnail(mock_get):
    response = MagicMock()
    response.json.return_value = COVER_ART_RESPONSE
    response.raise_for_status.return_value = None
    mock_get.return_value = response

    url = get_cover_art_url("9e80a911-a74a-4290-aa8a-159fb97351ad")

    assert url == "https://coverartarchive.org/release/9e80a911/full-500.jpg"


@patch("catalog.coverartarchive.requests.get")
def test_get_cover_art_url_returns_empty_string_when_no_front_image(mock_get):
    response = MagicMock()
    response.json.return_value = COVER_ART_RESPONSE_NO_FRONT
    response.raise_for_status.return_value = None
    mock_get.return_value = response

    assert get_cover_art_url("x") == ""


@patch("catalog.coverartarchive.requests.get")
def test_get_cover_art_url_returns_empty_string_on_404(mock_get):
    response = MagicMock()
    response.raise_for_status.side_effect = requests.HTTPError(response=MagicMock(status_code=404))
    mock_get.return_value = response

    assert get_cover_art_url("no-art-mbid") == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/tests/test_coverartarchive.py -v`
Expected: `ModuleNotFoundError: No module named 'catalog.coverartarchive'`.

- [ ] **Step 3: Write the client**

```python
# backend/catalog/coverartarchive.py
import requests

BASE_URL = "https://coverartarchive.org"


def get_cover_art_url(release_mbid):
    try:
        response = requests.get(f"{BASE_URL}/release/{release_mbid}", timeout=10)
        response.raise_for_status()
    except requests.HTTPError:
        return ""
    data = response.json()
    for image in data.get("images", []):
        if image.get("front"):
            thumbnails = image.get("thumbnails", {})
            return thumbnails.get("500") or image.get("image", "")
    return ""
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/tests/test_coverartarchive.py -v`
Expected: all tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/catalog/coverartarchive.py backend/catalog/tests/test_coverartarchive.py
git commit -m "feat(backend): add Cover Art Archive client"
```

---

### Task 4: `sync_musicbrainz` management command

**Files:**
- Create: `backend/catalog/management/commands/sync_musicbrainz.py`
- Test: `backend/catalog/tests/test_sync_musicbrainz.py`

**Interfaces:**
- Consumes: `catalog.musicbrainz.{search_uruguayan_artists, get_album_release_groups, get_release_for_release_group, get_tracklist}` (Task 2), `catalog.coverartarchive.get_cover_art_url` (Task 3), `catalog.models.{Artist, Album, Song, SyncState}` (Task 1).
- Produces: `python manage.py sync_musicbrainz [--limit N]` (default `limit=5`) — upserts `limit` artists starting from `SyncState.musicbrainz_offset`, then advances and saves the offset (wrapping to 0 past the end), consumed by Task 5's admin action.

- [ ] **Step 1: Write the failing tests**

```python
# backend/catalog/tests/test_sync_musicbrainz.py
from unittest.mock import patch

import pytest
from django.core.management import call_command

from catalog.models import Album, Artist, Song, SyncState

ARTISTS_PAGE_1 = (
    [{"mbid": "artist-1", "name": "Jorge Drexler"}],
    1,  # total count
)

RELEASE_GROUPS = [{"mbid": "album-1", "title": "Vaivén", "year": 1996, "genre": ""}]

RELEASE = {"mbid": "release-1", "has_cover_art": True}

TRACKLIST = [
    {"mbid": "song-1", "title": "Luna negra", "duration_seconds": 186},
    {"mbid": "song-2", "title": "Cerca del mar", "duration_seconds": 222},
]


def _run_sync(limit=5):
    with patch("catalog.management.commands.sync_musicbrainz.search_uruguayan_artists") as mock_search, \
         patch("catalog.management.commands.sync_musicbrainz.get_album_release_groups") as mock_groups, \
         patch("catalog.management.commands.sync_musicbrainz.get_release_for_release_group") as mock_release, \
         patch("catalog.management.commands.sync_musicbrainz.get_tracklist") as mock_tracklist, \
         patch("catalog.management.commands.sync_musicbrainz.get_cover_art_url") as mock_cover:
        mock_search.return_value = ARTISTS_PAGE_1
        mock_groups.return_value = RELEASE_GROUPS
        mock_release.return_value = RELEASE
        mock_tracklist.return_value = TRACKLIST
        mock_cover.return_value = "https://coverartarchive.org/release-1/front-500.jpg"
        call_command("sync_musicbrainz", limit=limit)
        return mock_search, mock_groups, mock_release, mock_tracklist, mock_cover


@pytest.mark.django_db
def test_sync_creates_artist_album_and_songs():
    _run_sync()
    artist = Artist.objects.get(mbid="artist-1")
    assert artist.name == "Jorge Drexler"
    album = Album.objects.get(mbid="album-1")
    assert album.artist == artist
    assert album.year == 1996
    assert album.cover_art_url == "https://coverartarchive.org/release-1/front-500.jpg"
    assert Song.objects.filter(album=album).count() == 2


@pytest.mark.django_db
def test_sync_is_idempotent_and_preserves_manual_edits():
    _run_sync()
    artist = Artist.objects.get(mbid="artist-1")
    artist.instagram_handle = "@jorgedrexler"
    artist.save()

    _run_sync()

    assert Artist.objects.filter(mbid="artist-1").count() == 1
    assert Album.objects.filter(mbid="album-1").count() == 1
    assert Song.objects.filter(album__mbid="album-1").count() == 2
    artist.refresh_from_db()
    assert artist.instagram_handle == "@jorgedrexler"


@pytest.mark.django_db
def test_sync_skips_album_with_no_releases():
    with patch("catalog.management.commands.sync_musicbrainz.search_uruguayan_artists") as mock_search, \
         patch("catalog.management.commands.sync_musicbrainz.get_album_release_groups") as mock_groups, \
         patch("catalog.management.commands.sync_musicbrainz.get_release_for_release_group") as mock_release, \
         patch("catalog.management.commands.sync_musicbrainz.get_tracklist") as mock_tracklist:
        mock_search.return_value = ARTISTS_PAGE_1
        mock_groups.return_value = RELEASE_GROUPS
        mock_release.return_value = None  # no releases for this release-group
        call_command("sync_musicbrainz", limit=5)
        mock_tracklist.assert_not_called()

    assert Album.objects.filter(mbid="album-1").exists()
    assert not Song.objects.exists()


@pytest.mark.django_db
def test_sync_advances_and_wraps_the_offset():
    with patch("catalog.management.commands.sync_musicbrainz.search_uruguayan_artists") as mock_search, \
         patch("catalog.management.commands.sync_musicbrainz.get_album_release_groups", return_value=[]):
        mock_search.return_value = ([{"mbid": "artist-1", "name": "A"}], 1)
        call_command("sync_musicbrainz", limit=5)

        state = SyncState.get_solo()
        assert state.musicbrainz_offset == 0  # wrapped: 1 artist total, offset+1 >= count

        mock_search.return_value = (
            [{"mbid": f"artist-{i}", "name": f"Artist {i}"} for i in range(5)],
            12,
        )
        call_command("sync_musicbrainz", limit=5)

        state.refresh_from_db()
        assert state.musicbrainz_offset == 5
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/tests/test_sync_musicbrainz.py -v`
Expected: `ModuleNotFoundError: No module named 'catalog.management.commands.sync_musicbrainz'`.

- [ ] **Step 3: Write the command**

```python
# backend/catalog/management/commands/sync_musicbrainz.py
from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.coverartarchive import get_cover_art_url
from catalog.models import Album, Artist, Song, SyncState
from catalog.musicbrainz import (
    get_album_release_groups,
    get_release_for_release_group,
    get_tracklist,
    search_uruguayan_artists,
)


class Command(BaseCommand):
    help = (
        "Sync a bounded batch of Uruguayan artists/albums/songs from "
        "MusicBrainz + Cover Art Archive, resuming from the last offset."
    )

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=5)

    def handle(self, *args, **options):
        limit = options["limit"]
        state = SyncState.get_solo()

        artists, total_count = search_uruguayan_artists(
            offset=state.musicbrainz_offset, limit=limit
        )

        for artist_data in artists:
            self._sync_artist(artist_data)

        next_offset = state.musicbrainz_offset + len(artists)
        state.musicbrainz_offset = next_offset if next_offset < total_count else 0
        state.save()

        self.stdout.write(
            f"Synced {len(artists)} artist(s); next offset {state.musicbrainz_offset} of {total_count}."
        )

    @transaction.atomic
    def _sync_artist(self, artist_data):
        artist, _ = Artist.objects.update_or_create(
            mbid=artist_data["mbid"], defaults={"name": artist_data["name"]}
        )

        for album_data in get_album_release_groups(artist.mbid):
            release = get_release_for_release_group(album_data["mbid"])
            cover_art_url = ""
            if release and release["has_cover_art"]:
                cover_art_url = get_cover_art_url(release["mbid"])

            album, _ = Album.objects.update_or_create(
                mbid=album_data["mbid"],
                defaults={
                    "name": album_data["title"],
                    "artist": artist,
                    "year": album_data["year"],
                    "genre": album_data["genre"],
                    "cover_art_url": cover_art_url,
                },
            )

            if release is None:
                continue

            for track in get_tracklist(release["mbid"]):
                Song.objects.update_or_create(
                    mbid=track["mbid"],
                    defaults={
                        "title": track["title"],
                        "album": album,
                        "duration_seconds": track["duration_seconds"],
                    },
                )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/ core/ -v`
Expected: all tests `PASS` (full suite, not just the new file).

- [ ] **Step 5: Commit**

```bash
git add backend/catalog/management/commands/sync_musicbrainz.py backend/catalog/tests/test_sync_musicbrainz.py
git commit -m "feat(backend): add sync_musicbrainz management command"
```

---

### Task 5: Admin action to trigger the sync

**Files:**
- Modify: `backend/catalog/admin.py`
- Test: `backend/catalog/tests/test_admin.py`

**Interfaces:**
- Consumes: `catalog.management.commands.sync_musicbrainz` (Task 4), run via `django.core.management.call_command`.
- Produces: a "Sincronizar con MusicBrainz (5 artistas)" action in the Artist admin's action dropdown, visible to any staff user.

> **Design note:** this is a dropdown action, not a dedicated button — Django
> admin's native action mechanism (select rows, pick an action, click Go) is
> the standard, template-override-free way to add a custom operation to the
> admin, and needs no extra view/URL/template. It ignores the selected
> queryset entirely and always syncs the next bounded batch from
> `SyncState`. The batch is deliberately small (5 artists, per Task 4's
> default) so the whole action finishes well inside Render's request
> timeout — there's no background worker to hand a bigger job to. Brandon
> runs it multiple times to build up the catalog.

- [ ] **Step 1: Write the failing test**

```python
# backend/catalog/tests/test_admin.py
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

User = get_user_model()


@pytest.fixture
def staff_client(client, db):
    user = User.objects.create_superuser(
        username="admin@example.com", email="admin@example.com", password="pw"
    )
    client.force_login(user)
    return client


@pytest.mark.django_db
def test_sync_action_calls_the_management_command(staff_client):
    from catalog.models import Artist

    Artist.objects.create(mbid="a1", name="Artist One")

    with patch("catalog.admin.call_command") as mock_call_command:
        response = staff_client.post(
            reverse("admin:catalog_artist_changelist"),
            {
                "action": "sync_with_musicbrainz",
                "_selected_action": [str(Artist.objects.get().pk)],
            },
            follow=True,
        )

    assert response.status_code == 200
    mock_call_command.assert_called_once_with("sync_musicbrainz")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/tests/test_admin.py -v`
Expected: FAIL — no action named `sync_with_musicbrainz` is registered, so Django's admin rejects the POST (follow=True surfaces a 200 with an error message rather than applying anything; `mock_call_command` is never called).

- [ ] **Step 3: Wire the action**

```python
# backend/catalog/admin.py
from django.contrib import admin, messages
from django.core.management import call_command

from .models import Album, Artist, Song


@admin.action(description="Sincronizar con MusicBrainz (próximos 5 artistas)")
def sync_with_musicbrainz(modeladmin, request, queryset):
    try:
        call_command("sync_musicbrainz")
    except Exception as exc:  # pragma: no cover - surfaced to the admin, not hidden
        modeladmin.message_user(
            request, f"Error al sincronizar: {exc}", level=messages.ERROR
        )
        return
    modeladmin.message_user(
        request, "Sincronización completa.", level=messages.SUCCESS
    )


@admin.register(Artist)
class ArtistAdmin(admin.ModelAdmin):
    list_display = ("name", "mbid", "instagram_handle")
    search_fields = ("name",)
    actions = [sync_with_musicbrainz]


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ("name", "artist", "year", "genre")
    list_filter = ("year",)
    search_fields = ("name",)


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ("title", "album", "duration_seconds")
    search_fields = ("title",)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest catalog/ core/ -v`
Expected: all tests `PASS`.

- [ ] **Step 5: Manual verification against the real APIs (not mocked)**

This is the one point in the plan where hitting the real MusicBrainz/Cover
Art Archive APIs is the point — the whole command has only ever been
exercised against mocks so far.

Run: `cd backend && ./.venv/bin/python manage.py sync_musicbrainz --limit 2`
Expected: takes a few seconds (real HTTP, rate-limited), prints a line like
`Synced 2 artist(s); next offset 2 of 1040.` Then run:
`./.venv/bin/python manage.py shell -c "from catalog.models import Artist, Album, Song; print(Artist.objects.count(), Album.objects.count(), Song.objects.count())"`
Expected: non-zero counts for all three.

- [ ] **Step 6: Manual verification of the admin UI**

Run `./.venv/bin/python manage.py runserver`, log in at `http://localhost:8000/admin/` with
a local superuser (`./.venv/bin/python manage.py createsuperuser` first, using a local-only
password — this is separate from the `DJANGO_SUPERUSER_*` env vars, which only apply in prod).
Open the Artist list, select any row's checkbox, choose "Sincronizar con
MusicBrainz (próximos 5 artistas)" from the action dropdown, click Go.
Expected: a green "Sincronización completa." banner, and 5 more artists
appear after a refresh.

- [ ] **Step 7: Commit**

```bash
git add backend/catalog/admin.py backend/catalog/tests/test_admin.py
git commit -m "feat(backend): add admin action to trigger a bounded MusicBrainz sync"
```