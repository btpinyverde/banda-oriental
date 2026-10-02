# Gameplay API (Plan 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public API that runs the daily game: fetch today's state, submit guesses with Wordle-style feedback, record a final score, and serve the leaderboard and archive.

**Architecture:** Django REST Framework function-free class-based views (`APIView`, matching `core/views.py`'s existing style), backed by two new pure-function modules (`gameplay/feedback.py`, `gameplay/scoring.py`) that contain all game-rule logic with zero DB access, so they're trivially unit-testable. Views stay thin: look up rows, call the pure functions, shape a `Response`. All anonymous-device state keys off a client-supplied `X-Device-Id` header (a UUID the frontend generates and keeps in `localStorage` — this plan does not touch the frontend, only validates the header is present and well-formed).

**Tech Stack:** Django 5.1, Django REST Framework (already installed, `REST_FRAMEWORK` configured in `backend/config/settings/base.py` for anonymous-only access and JSON-only rendering — see Plan 1).

**Spec:** `docs/superpowers/specs/2026-10-02-banda-oriental-design.md` (§4 modelo de datos, §6 mecánica de juego, §7 API y validación, §8 scoring, §11 leaderboard y moderación, §12 compartir y archivo, §14 testing)

## Global Constraints

- No login — every endpoint identifies a player only by the anonymous `X-Device-Id` header (spec §4, §9).
- The frontend never receives the answer or future stems ahead of time (spec §7) — `GET /api/daily/` must only ever return stems up to the device's current unlocked count, and the DailySong's `song` must never appear in any response before the device has won or exhausted all 6 attempts.
- Scoring constants (base score per attempt, speed bonus shape) live in Django settings, never hardcoded in a view or in the frontend (spec §8).
- `America/Montevideo` is "today" — use `django.utils.timezone.localdate()`, never `date.today()` (the latter ignores `settings.TIME_ZONE`).
- One `ScoreEntry` per device per day, enforced by the existing `UniqueConstraint` on `ScoreEntry` (Plan 3a) — a repeat submission must come back as a clean 400, never a 500 from a raw `IntegrityError`.
- A device can't submit more than 6 `GuessAttempt` rows for the same `DailySong`, and can't skip an attempt number (spec §6: exactly one stem and one feedback row unlocked per failed attempt, in order).
- Audio URLs returned to the frontend are the signed, private R2 URLs `Stem.audio_file.url` already produces (Plan 3a Task 2) — never a raw key or public link.

## Review Focus

- A device replays the same day a second time (after already winning or losing) — `GET /api/daily/` must return the stored final result, not let them play again, and `POST /api/daily/guess/` must reject it.
- A device calls `POST /api/daily/guess/` with an `attempt_number` that skips ahead (e.g. submitting attempt 3 as their first-ever request) — must be rejected, not silently accepted as if lower attempts happened.
- A `DailySong` exists for today but is still in `draft` state (the admin hasn't published it) — `GET /api/daily/` must treat it as "no game today," not leak the draft's stems.
- `Album.year` or `Album.genre` is blank for the target or the guessed song (spec §15: MusicBrainz coverage gaps are expected, especially genre) — feedback calculation must return an explicit "unknown" state for that axis instead of crashing or falsely claiming a match.
- A `display_name` submitted to `POST /api/daily/score/` contains a banned word — must be rejected (or sanitized — this plan rejects with a 400) before it ever reaches the leaderboard, per spec §11.

---

## Task 1: Feedback calculation

**Files:**
- Create: `backend/gameplay/feedback.py`
- Test: `backend/gameplay/tests/test_feedback.py`

**Interfaces:**
- Produces: `calculate_feedback(guessed_song: catalog.models.Song, target_song: catalog.models.Song) -> dict` — a JSON-serializable dict with exactly the keys `"year"`, `"genre"`, `"artist"`, `"album"`. Consumed by Task 5 (`POST /api/daily/guess/`), stored verbatim into `GuessAttempt.feedback`.
- Consumes: `catalog.models.Song` (`.title`, `.album.year`, `.album.genre`, `.album.artist.name`, `.album.name` — all from the already-merged catalog app).

- [ ] **Step 1: Write the failing tests**

```python
# backend/gameplay/tests/test_feedback.py
import pytest

from catalog.models import Album, Artist, Song
from gameplay.feedback import calculate_feedback


def _song(title, *, artist_name, album_name, year=None, genre=""):
    artist, _ = Artist.objects.get_or_create(mbid=f"artist-{artist_name}", defaults={"name": artist_name})
    album, _ = Album.objects.get_or_create(
        mbid=f"album-{album_name}",
        defaults={"name": album_name, "artist": artist, "year": year, "genre": genre},
    )
    return Song.objects.create(mbid=f"song-{title}", title=title, album=album)


@pytest.mark.django_db
def test_exact_match_on_every_axis():
    target = _song("Luna negra", artist_name="Jorge Drexler", album_name="Vaivén", year=1996, genre="folk")
    guess = _song("Otra de Drexler", artist_name="Jorge Drexler", album_name="Vaivén", year=1996, genre="folk")

    feedback = calculate_feedback(guess, target)

    assert feedback == {"year": "exact", "genre": "same", "artist": "same", "album": "same"}


@pytest.mark.django_db
def test_guess_year_is_older_than_target():
    target = _song("Target", artist_name="A", album_name="Target Album", year=2000)
    guess = _song("Guess", artist_name="B", album_name="Guess Album", year=1990)

    feedback = calculate_feedback(guess, target)

    # The guessed song is from 1990, the target is from 2000 — relative to
    # the guess, the correct answer is *newer*.
    assert feedback["year"] == "newer"


@pytest.mark.django_db
def test_guess_year_is_newer_than_target():
    target = _song("Target", artist_name="A", album_name="Target Album", year=1990)
    guess = _song("Guess", artist_name="B", album_name="Guess Album", year=2000)

    feedback = calculate_feedback(guess, target)

    assert feedback["year"] == "older"


@pytest.mark.django_db
def test_year_unknown_when_either_song_has_no_year():
    target = _song("Target", artist_name="A", album_name="Target Album", year=None)
    guess = _song("Guess", artist_name="B", album_name="Guess Album", year=2000)

    feedback = calculate_feedback(guess, target)

    assert feedback["year"] == "unknown"


@pytest.mark.django_db
def test_genre_unknown_when_either_song_has_blank_genre():
    target = _song("Target", artist_name="A", album_name="Target Album", genre="")
    guess = _song("Guess", artist_name="B", album_name="Guess Album", genre="rock")

    feedback = calculate_feedback(guess, target)

    assert feedback["genre"] == "unknown"


@pytest.mark.django_db
def test_different_artist_and_album():
    target = _song("Target", artist_name="Jorge Drexler", album_name="Vaivén")
    guess = _song("Guess", artist_name="No Te Va Gustar", album_name="Otra cosa")

    feedback = calculate_feedback(guess, target)

    assert feedback["artist"] == "different"
    assert feedback["album"] == "different"


@pytest.mark.django_db
def test_same_artist_different_album():
    artist, _ = Artist.objects.get_or_create(mbid="shared-artist", defaults={"name": "Jorge Drexler"})
    target_album = Album.objects.create(mbid="album-1", name="Vaivén", artist=artist)
    guess_album = Album.objects.create(mbid="album-2", name="Salvavidas de hielo", artist=artist)
    target = Song.objects.create(mbid="song-target", title="Target", album=target_album)
    guess = Song.objects.create(mbid="song-guess", title="Guess", album=guess_album)

    feedback = calculate_feedback(guess, target)

    assert feedback["artist"] == "same"
    assert feedback["album"] == "different"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_feedback.py -v`
Expected: `ModuleNotFoundError: No module named 'gameplay.feedback'`.

- [ ] **Step 3: Implement the feedback calculation**

```python
# backend/gameplay/feedback.py
def calculate_feedback(guessed_song, target_song):
    """Compare a guessed Song against the target Song on 4 axes, from the
    guesser's point of view (spec §6): for "year", the value describes
    where the *correct* answer sits relative to the guess.
    """
    guessed_album = guessed_song.album
    target_album = target_song.album

    return {
        "year": _compare_year(guessed_album.year, target_album.year),
        "genre": _compare_exact(guessed_album.genre, target_album.genre),
        "artist": _compare_exact(guessed_album.artist_id, target_album.artist_id, same="same", different="different"),
        "album": _compare_exact(guessed_album.id, target_album.id, same="same", different="different"),
    }


def _compare_year(guessed_year, target_year):
    if guessed_year is None or target_year is None:
        return "unknown"
    if guessed_year == target_year:
        return "exact"
    return "newer" if target_year > guessed_year else "older"


def _compare_exact(guessed_value, target_value, *, same="same", different="different"):
    if not guessed_value or not target_value:
        return "unknown"
    return same if guessed_value == target_value else different
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_feedback.py -v`
Expected: all 7 tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/gameplay/feedback.py backend/gameplay/tests/test_feedback.py
git commit -m "feat(backend): add Wordle-style feedback calculation for guesses"
```

---

## Task 2: Scoring calculation

**Files:**
- Create: `backend/gameplay/scoring.py`
- Modify: `backend/config/settings/base.py`
- Test: `backend/gameplay/tests/test_scoring.py`

**Interfaces:**
- Produces: `calculate_score(winning_attempt: int, total_time_seconds: float) -> int`. Consumed by Task 6 (`POST /api/daily/score/`).
- Consumes: `settings.GAMEPLAY_BASE_SCORES` (dict, attempt number 1-6 → base score int) and `settings.GAMEPLAY_SPEED_BONUS` (dict with `max`, `min_elapsed_seconds`, `max_elapsed_seconds`) — both defined in this task.

- [ ] **Step 1: Write the failing tests**

```python
# backend/gameplay/tests/test_scoring.py
from django.test import override_settings

from gameplay.scoring import calculate_score

SCORING_SETTINGS = {
    "GAMEPLAY_BASE_SCORES": {1: 100, 2: 85, 3: 70, 4: 55, 5: 40, 6: 20},
    "GAMEPLAY_SPEED_BONUS": {"max": 50, "min_elapsed_seconds": 1, "max_elapsed_seconds": 60},
}


@override_settings(**SCORING_SETTINGS)
def test_fastest_possible_first_attempt_scores_base_plus_full_bonus():
    # At or below min_elapsed_seconds, the bonus is the full max.
    assert calculate_score(winning_attempt=1, total_time_seconds=0.5) == 100 + 50


@override_settings(**SCORING_SETTINGS)
def test_slowest_counted_attempt_scores_base_plus_zero_bonus():
    # At or above max_elapsed_seconds, the bonus floors at zero.
    assert calculate_score(winning_attempt=1, total_time_seconds=120) == 100 + 0


@override_settings(**SCORING_SETTINGS)
def test_bonus_decreases_linearly_between_the_floor_and_ceiling():
    # Halfway between min (1s) and max (60s) elapsed → half the max bonus.
    halfway = (1 + 60) / 2
    assert calculate_score(winning_attempt=1, total_time_seconds=halfway) == 100 + 25


@override_settings(**SCORING_SETTINGS)
def test_base_score_decreases_by_attempt():
    # Same time for every attempt isolates the base-score component.
    scores = [calculate_score(winning_attempt=n, total_time_seconds=0.5) for n in range(1, 7)]
    assert scores == [150, 135, 120, 105, 90, 70]


@override_settings(**SCORING_SETTINGS)
def test_negative_elapsed_time_is_clamped_to_the_floor_not_a_bug():
    # A client-reported negative time (clock skew, bad data) must not
    # produce a bonus larger than the configured max.
    assert calculate_score(winning_attempt=1, total_time_seconds=-5) == 100 + 50
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_scoring.py -v`
Expected: `ModuleNotFoundError: No module named 'gameplay.scoring'`.

- [ ] **Step 3: Add the settings and implement scoring**

```python
# backend/config/settings/base.py — add near the bottom
# Scoring constants live here (spec §8), never hardcoded in a view or in
# the frontend, so they can be tuned without a frontend deploy.
GAMEPLAY_BASE_SCORES = {1: 100, 2: 85, 3: 70, 4: 55, 5: 40, 6: 20}
GAMEPLAY_SPEED_BONUS = {
    "max": 50,
    # Below this, a guess counts as "instant" and gets the full bonus —
    # protects against a near-zero elapsed time looking infinitely good.
    "min_elapsed_seconds": 1,
    # At or beyond this, the bonus floors at zero — protects against a
    # huge or negative elapsed time (clock skew, a tab left open) ever
    # producing an absurd or negative score (spec §8).
    "max_elapsed_seconds": 60,
}
```

```python
# backend/gameplay/scoring.py
from django.conf import settings


def calculate_score(winning_attempt, total_time_seconds):
    base = settings.GAMEPLAY_BASE_SCORES[winning_attempt]
    return base + _speed_bonus(total_time_seconds)


def _speed_bonus(total_time_seconds):
    config = settings.GAMEPLAY_SPEED_BONUS
    min_elapsed = config["min_elapsed_seconds"]
    max_elapsed = config["max_elapsed_seconds"]
    max_bonus = config["max"]

    clamped = max(min_elapsed, min(total_time_seconds, max_elapsed))
    fraction_remaining = 1 - (clamped - min_elapsed) / (max_elapsed - min_elapsed)
    return round(max_bonus * fraction_remaining)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_scoring.py -v`
Expected: all 5 tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/gameplay/scoring.py backend/gameplay/tests/test_scoring.py backend/config/settings/base.py
git commit -m "feat(backend): add configurable scoring calculation (base score + speed bonus)"
```

---

## Task 3: Display-name moderation

**Files:**
- Create: `backend/gameplay/moderation.py`
- Test: `backend/gameplay/tests/test_moderation.py`

**Interfaces:**
- Produces: `contains_banned_word(text: str) -> bool`. Consumed by Task 6 (`POST /api/daily/score/`) to reject a `display_name` before saving.

- [ ] **Step 1: Write the failing tests**

```python
# backend/gameplay/tests/test_moderation.py
from gameplay.moderation import contains_banned_word


def test_clean_name_is_allowed():
    assert contains_banned_word("Brandon") is False


def test_banned_word_is_caught_case_insensitively():
    assert contains_banned_word("ESTOYbannedWORD1aqui") is True


def test_banned_word_as_a_substring_is_caught():
    assert contains_banned_word("xbannedword1x") is True


def test_empty_string_is_allowed():
    assert contains_banned_word("") is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_moderation.py -v`
Expected: `ModuleNotFoundError: No module named 'gameplay.moderation'`.

- [ ] **Step 3: Implement a minimal banned-word list**

The brief says "lista básica ES/EN" (spec §11) — this plan ships a tiny
placeholder list with one deliberately-fake entry (`bannedword1`) so the
tests above are self-contained and don't encode real slurs into the repo
or this plan document. Brandon should replace `BANNED_WORDS` with a real
list before launch; that edit doesn't need a plan.

```python
# backend/gameplay/moderation.py
BANNED_WORDS = {"bannedword1"}


def contains_banned_word(text):
    lowered = text.lower()
    return any(word in lowered for word in BANNED_WORDS)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_moderation.py -v`
Expected: all 4 tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/gameplay/moderation.py backend/gameplay/tests/test_moderation.py
git commit -m "feat(backend): add display-name moderation filter"
```

---

## Task 4: Device-id handling and `GET /api/daily/`

**Files:**
- Create: `backend/gameplay/views.py`
- Create: `backend/gameplay/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/gameplay/tests/test_api_daily.py`

**Interfaces:**
- Produces: `gameplay.views.get_device_id(request)` (raises `rest_framework.exceptions.ValidationError` if the `X-Device-Id` header is missing or blank) — consumed by every view in Tasks 4-6. Produces the URL name `"daily"` at `/api/daily/`.
- Consumes: `gameplay.models.DailySong`, `gameplay.models.Stem`, `gameplay.models.GuessAttempt`, `gameplay.models.ScoreEntry` (Plan 3a).

- [ ] **Step 1: Write the failing tests**

```python
# backend/gameplay/tests/test_api_daily.py
import pytest
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, ScoreEntry, Stem

DEVICE_ID = "11111111-1111-1111-1111-111111111111"


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
def test_daily_unlocked_stems_are_real_signed_urls(client, published_today):
    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)

    url = response.json()["unlocked_stems"][0]["url"]
    assert url.startswith("http")
    assert "fake-1.mp3" not in url  # it's a storage URL, not the raw filename


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_api_daily.py -v`
Expected: fails with `NoReverseMatch` (no `gameplay` URL namespace yet) or `ModuleNotFoundError` for `gameplay.views` — either way, every test fails before the view exists.

- [ ] **Step 3: Implement the device-id helper and the daily view**

```python
# backend/gameplay/views.py
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DailySong, GuessAttempt, ScoreEntry


def get_device_id(request):
    device_id = request.headers.get("X-Device-Id", "").strip()
    if not device_id:
        raise ValidationError({"device_id": "The X-Device-Id header is required."})
    return device_id


class DailyView(APIView):
    def get(self, request):
        device_id = get_device_id(request)
        daily_song = DailySong.objects.filter(
            date=timezone.localdate(), state=DailySong.PUBLISHED
        ).first()
        if daily_song is None:
            return Response({"detail": "No hay canción publicada para hoy."}, status=404)

        score = ScoreEntry.objects.filter(device_id=device_id, daily_song=daily_song).first()
        if score is not None:
            return self._finished_response(daily_song, won=True, score=score)

        attempts = list(
            GuessAttempt.objects.filter(device_id=device_id, daily_song=daily_song).order_by(
                "attempt_number"
            )
        )
        if len(attempts) >= 6:
            # Six failed attempts and no ScoreEntry means the device lost
            # today — spec §6 says a lost game reveals the answer, same as
            # a win does, just with no score.
            return self._finished_response(daily_song, won=False, score=None)

        attempt_number = len(attempts) + 1
        stems = daily_song.stems.filter(unlock_order__lte=attempt_number).order_by("unlock_order")

        return Response(
            {
                "day": str(daily_song.date),
                "attempt_number": attempt_number,
                "attempts_remaining": 6 - len(attempts),
                "unlocked_stems": [
                    {"stem_type": stem.stem_type, "unlock_order": stem.unlock_order, "url": stem.audio_file.url}
                    for stem in stems
                ],
                "feedback_history": [
                    {"attempt_number": a.attempt_number, "feedback": a.feedback} for a in attempts
                ],
                "finished": False,
            }
        )

    def _finished_response(self, daily_song, *, won, score):
        body = {
            "day": str(daily_song.date),
            "finished": True,
            "won": won,
            "song": {
                "title": daily_song.song.title,
                "artist": daily_song.song.album.artist.name,
                "album": daily_song.song.album.name,
            },
        }
        if score is not None:
            body["score"] = score.score
            body["winning_attempt"] = score.winning_attempt
        return Response(body)
```

```python
# backend/gameplay/urls.py
from django.urls import path

from .views import DailyView

app_name = "gameplay"

urlpatterns = [
    path("daily/", DailyView.as_view(), name="daily"),
]
```

```python
# backend/config/urls.py — replace the full file
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("gameplay.urls")),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/ catalog/ core/ -v`
Expected: all tests `PASS`, including `test_daily_reveals_the_answer_after_six_failed_attempts_with_no_score`.

- [ ] **Step 5: Commit**

```bash
git add backend/gameplay/views.py backend/gameplay/urls.py backend/gameplay/tests/test_api_daily.py backend/config/urls.py
git commit -m "feat(backend): add GET /api/daily/ with per-device unlocked-stem state"
```

---

## Task 5: `POST /api/daily/guess/`

**Files:**
- Modify: `backend/gameplay/views.py`
- Modify: `backend/gameplay/urls.py`
- Test: `backend/gameplay/tests/test_api_guess.py`

**Interfaces:**
- Produces: URL name `"guess"` at `/api/daily/guess/`. Response shape: `{"is_correct": bool, "attempt_number": int, "feedback": dict, "finished": bool, "attempts_remaining": int}`.
- Consumes: `gameplay.feedback.calculate_feedback` (Task 1), `gameplay.views.get_device_id` (Task 4).

- [ ] **Step 1: Write the failing tests**

```python
# backend/gameplay/tests/test_api_guess.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_api_guess.py -v`
Expected: `NoReverseMatch` for `gameplay:guess` (not registered yet).

- [ ] **Step 3: Implement the guess view**

```python
# backend/gameplay/views.py — add these imports and this class
from catalog.models import Song
from rest_framework.response import Response
from rest_framework.views import APIView

from .feedback import calculate_feedback


class GuessView(APIView):
    def post(self, request):
        device_id = get_device_id(request)
        daily_song = DailySong.objects.filter(
            date=timezone.localdate(), state=DailySong.PUBLISHED
        ).first()
        if daily_song is None:
            return Response({"detail": "No hay canción publicada para hoy."}, status=404)

        if ScoreEntry.objects.filter(device_id=device_id, daily_song=daily_song).exists():
            return Response({"detail": "Ya jugaste hoy."}, status=400)

        existing_attempts = GuessAttempt.objects.filter(
            device_id=device_id, daily_song=daily_song
        ).count()
        if existing_attempts >= 6:
            return Response({"detail": "No te quedan intentos."}, status=400)

        attempt_number = request.data.get("attempt_number")
        if attempt_number != existing_attempts + 1:
            return Response({"detail": "Número de intento inválido."}, status=400)

        try:
            guessed_song = Song.objects.select_related("album__artist").get(
                pk=request.data.get("song_id")
            )
        except (Song.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Canción no encontrada."}, status=400)

        is_correct = guessed_song.id == daily_song.song_id
        feedback = calculate_feedback(guessed_song, daily_song.song)

        GuessAttempt.objects.create(
            device_id=device_id,
            daily_song=daily_song,
            attempt_number=attempt_number,
            guessed_text=guessed_song.title,
            is_correct=is_correct,
            feedback=feedback,
        )

        finished = is_correct or attempt_number == 6
        return Response(
            {
                "is_correct": is_correct,
                "attempt_number": attempt_number,
                "feedback": feedback,
                "finished": finished,
                "attempts_remaining": 6 - attempt_number,
            }
        )
```

```python
# backend/gameplay/urls.py — replace the full file
from django.urls import path

from .views import DailyView, GuessView

app_name = "gameplay"

urlpatterns = [
    path("daily/", DailyView.as_view(), name="daily"),
    path("daily/guess/", GuessView.as_view(), name="guess"),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/ catalog/ core/ -v`
Expected: all tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/gameplay/views.py backend/gameplay/urls.py backend/gameplay/tests/test_api_guess.py
git commit -m "feat(backend): add POST /api/daily/guess/ with sequential-attempt anti-cheat"
```

---

## Task 6: `POST /api/daily/score/`

**Files:**
- Modify: `backend/gameplay/views.py`
- Modify: `backend/gameplay/urls.py`
- Test: `backend/gameplay/tests/test_api_score.py`

**Interfaces:**
- Produces: URL name `"score"` at `/api/daily/score/`.
- Consumes: `gameplay.scoring.calculate_score` (Task 2), `gameplay.moderation.contains_banned_word` (Task 3), `gameplay.views.get_device_id` (Task 4). The winning `attempt_number` is derived from the device's own stored `GuessAttempt` rows, never trusted from the request body (anti-cheat, spec §7).

- [ ] **Step 1: Write the failing tests**

```python
# backend/gameplay/tests/test_api_score.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_api_score.py -v`
Expected: `NoReverseMatch` for `gameplay:score`.

- [ ] **Step 3: Implement the score view**

```python
# backend/gameplay/views.py — add these imports and this class
from .moderation import contains_banned_word
from .scoring import calculate_score


class ScoreView(APIView):
    def post(self, request):
        device_id = get_device_id(request)
        daily_song = DailySong.objects.filter(
            date=timezone.localdate(), state=DailySong.PUBLISHED
        ).first()
        if daily_song is None:
            return Response({"detail": "No hay canción publicada para hoy."}, status=404)

        if ScoreEntry.objects.filter(device_id=device_id, daily_song=daily_song).exists():
            return Response({"detail": "Ya enviaste tu puntaje de hoy."}, status=400)

        winning_attempt_obj = (
            GuessAttempt.objects.filter(device_id=device_id, daily_song=daily_song, is_correct=True)
            .order_by("attempt_number")
            .first()
        )
        if winning_attempt_obj is None:
            return Response({"detail": "Todavía no ganaste hoy."}, status=400)

        display_name = (request.data.get("display_name") or "").strip()
        if not display_name or contains_banned_word(display_name):
            return Response({"detail": "Nombre inválido."}, status=400)

        try:
            total_time_seconds = float(request.data.get("total_time_seconds"))
        except (TypeError, ValueError):
            return Response({"detail": "total_time_seconds inválido."}, status=400)

        score = calculate_score(winning_attempt_obj.attempt_number, total_time_seconds)

        entry = ScoreEntry.objects.create(
            device_id=device_id,
            daily_song=daily_song,
            display_name=display_name,
            score=score,
            winning_attempt=winning_attempt_obj.attempt_number,
            total_time_seconds=total_time_seconds,
        )
        return Response(
            {
                "score": entry.score,
                "winning_attempt": entry.winning_attempt,
                "display_name": entry.display_name,
            },
            status=201,
        )
```

```python
# backend/gameplay/urls.py — replace the full file
from django.urls import path

from .views import DailyView, GuessView, ScoreView

app_name = "gameplay"

urlpatterns = [
    path("daily/", DailyView.as_view(), name="daily"),
    path("daily/guess/", GuessView.as_view(), name="guess"),
    path("daily/score/", ScoreView.as_view(), name="score"),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/ catalog/ core/ -v`
Expected: all tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/gameplay/views.py backend/gameplay/urls.py backend/gameplay/tests/test_api_score.py
git commit -m "feat(backend): add POST /api/daily/score/ with server-derived winning attempt"
```

---

## Task 7: `GET /api/leaderboard/today/`

**Files:**
- Modify: `backend/gameplay/views.py`
- Modify: `backend/gameplay/urls.py`
- Test: `backend/gameplay/tests/test_api_leaderboard.py`

**Interfaces:**
- Produces: URL name `"leaderboard-today"` at `/api/leaderboard/today/`. Response: `{"day": "...", "entries": [{"display_name": ..., "score": ..., "winning_attempt": ...}, ...]}`, ordered by `score` descending.

- [ ] **Step 1: Write the failing tests**

```python
# backend/gameplay/tests/test_api_leaderboard.py
import pytest
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, ScoreEntry


@pytest.fixture
def target_song(db):
    artist = Artist.objects.create(mbid="artist-1", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-1", name="Vaivén", artist=artist, year=1996)
    return Song.objects.create(mbid="song-1", title="Luna negra", album=album)


@pytest.fixture
def published_today(db, target_song):
    return DailySong.objects.create(date=timezone.localdate(), song=target_song, state=DailySong.PUBLISHED)


@pytest.mark.django_db
def test_leaderboard_is_empty_with_no_scores(client, published_today):
    response = client.get(reverse("gameplay:leaderboard-today"))

    assert response.status_code == 200
    assert response.json()["entries"] == []


@pytest.mark.django_db
def test_leaderboard_orders_by_score_descending(client, published_today):
    ScoreEntry.objects.create(
        device_id="a", daily_song=published_today, display_name="Low", score=50,
        winning_attempt=5, total_time_seconds=10,
    )
    ScoreEntry.objects.create(
        device_id="b", daily_song=published_today, display_name="High", score=150,
        winning_attempt=1, total_time_seconds=2,
    )

    response = client.get(reverse("gameplay:leaderboard-today"))

    names = [entry["display_name"] for entry in response.json()["entries"]]
    assert names == ["High", "Low"]


@pytest.mark.django_db
def test_leaderboard_does_not_include_device_id(client, published_today):
    ScoreEntry.objects.create(
        device_id="a", daily_song=published_today, display_name="Brandon", score=100,
        winning_attempt=1, total_time_seconds=2,
    )

    response = client.get(reverse("gameplay:leaderboard-today"))

    assert "device_id" not in response.json()["entries"][0]


@pytest.mark.django_db
def test_leaderboard_with_no_published_day_returns_empty_not_404(client):
    response = client.get(reverse("gameplay:leaderboard-today"))

    assert response.status_code == 200
    assert response.json()["entries"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_api_leaderboard.py -v`
Expected: `NoReverseMatch` for `gameplay:leaderboard-today`.

- [ ] **Step 3: Implement the leaderboard view**

```python
# backend/gameplay/views.py — add this class
class LeaderboardTodayView(APIView):
    def get(self, request):
        today = timezone.localdate()
        daily_song = DailySong.objects.filter(date=today, state=DailySong.PUBLISHED).first()
        entries = []
        if daily_song is not None:
            entries = [
                {
                    "display_name": entry.display_name,
                    "score": entry.score,
                    "winning_attempt": entry.winning_attempt,
                }
                for entry in ScoreEntry.objects.filter(daily_song=daily_song).order_by("-score")
            ]
        return Response({"day": str(today), "entries": entries})
```

```python
# backend/gameplay/urls.py — replace the full file
from django.urls import path

from .views import DailyView, GuessView, LeaderboardTodayView, ScoreView

app_name = "gameplay"

urlpatterns = [
    path("daily/", DailyView.as_view(), name="daily"),
    path("daily/guess/", GuessView.as_view(), name="guess"),
    path("daily/score/", ScoreView.as_view(), name="score"),
    path("leaderboard/today/", LeaderboardTodayView.as_view(), name="leaderboard-today"),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/ catalog/ core/ -v`
Expected: all tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/gameplay/views.py backend/gameplay/urls.py backend/gameplay/tests/test_api_leaderboard.py
git commit -m "feat(backend): add GET /api/leaderboard/today/"
```

---

## Task 8: Archive endpoints

**Files:**
- Modify: `backend/gameplay/views.py`
- Modify: `backend/gameplay/urls.py`
- Test: `backend/gameplay/tests/test_api_archive.py`

**Interfaces:**
- Produces: URL names `"archive-list"` at `/api/archive/` and `"archive-detail"` at `/api/archive/<fecha>/`. Both only ever return `PUBLISHED` days whose date is strictly before today (spec §12: "vencido") — today's own day, even if published, is never listed, since the answer must stay hidden until the day is over.

- [ ] **Step 1: Write the failing tests**

```python
# backend/gameplay/tests/test_api_archive.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/tests/test_api_archive.py -v`
Expected: `NoReverseMatch` for `gameplay:archive-list`.

- [ ] **Step 3: Implement the archive views**

```python
# backend/gameplay/views.py — add these classes
class ArchiveListView(APIView):
    def get(self, request):
        today = timezone.localdate()
        days = DailySong.objects.filter(state=DailySong.PUBLISHED, date__lt=today).order_by("-date")
        return Response(
            {
                "days": [
                    {"date": str(day.date), "song_title": day.song.title, "artist": day.song.album.artist.name}
                    for day in days
                ]
            }
        )


class ArchiveDetailView(APIView):
    def get(self, request, fecha):
        today = timezone.localdate()
        daily_song = DailySong.objects.filter(
            date=fecha, state=DailySong.PUBLISHED, date__lt=today
        ).first()
        if daily_song is None:
            return Response({"detail": "Día no encontrado."}, status=404)

        song = daily_song.song
        return Response(
            {
                "date": str(daily_song.date),
                "song_title": song.title,
                "artist": song.album.artist.name,
                "album": song.album.name,
                "artist_instagram_handle": song.album.artist.instagram_handle,
            }
        )
```

```python
# backend/gameplay/urls.py — replace the full file
from django.urls import path

from .views import (
    ArchiveDetailView,
    ArchiveListView,
    DailyView,
    GuessView,
    LeaderboardTodayView,
    ScoreView,
)

app_name = "gameplay"

urlpatterns = [
    path("daily/", DailyView.as_view(), name="daily"),
    path("daily/guess/", GuessView.as_view(), name="guess"),
    path("daily/score/", ScoreView.as_view(), name="score"),
    path("leaderboard/today/", LeaderboardTodayView.as_view(), name="leaderboard-today"),
    path("archive/", ArchiveListView.as_view(), name="archive-list"),
    path("archive/<str:fecha>/", ArchiveDetailView.as_view(), name="archive-detail"),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./.venv/bin/python -m pytest gameplay/ catalog/ core/ -v`
Expected: all tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/gameplay/views.py backend/gameplay/urls.py backend/gameplay/tests/test_api_archive.py
git commit -m "feat(backend): add GET /api/archive/ and /api/archive/<fecha>/"
```
