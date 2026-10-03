# Frontend Daily Game Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/jugar` daily game screen end-to-end against the real backend API (no demo fixtures), with the visual design system (approved SVG kit, fonts, color tokens) applied, so a player can load today's song, listen to the progressively-unlocked stems, search the catalog, submit guesses, and see the final result.

**Architecture:** Next.js App Router with a thin server-rendered `page.tsx` wrapping a `"use client"` `GameScreen` that owns all game state. `GameScreen` composes four small, independently-testable components (`AudioPlayer`, `SongSearch`, `AttemptsTable`, `Icon`) through a typed API client (`lib/api.ts`) and a device-identity utility (`lib/device-id.ts`). Two small backend additions close gaps found while reviewing the real contracts: a song-list endpoint for the search box, and a `guessed_text` field on `GET /api/daily/`'s attempt history (needed to redraw past attempts after a page reload).

**Tech Stack:** Django 5.1.3 + DRF (backend additions), Next.js 16 (App Router) + TypeScript + Vitest + Testing Library (frontend), pytest + pytest-django (backend tests).

**Spec:** `docs/superpowers/specs/2026-10-02-banda-oriental-design.md` (sections 6-9 govern this plan). This plan also incorporates visual/UX decisions made in chat after reviewing a Codex-built frontend prototype (`_referencia-frontend.zip`, reviewed and partly adopted — see Global Constraints).

## Global Constraints

- Next.js App Router + TypeScript, not a pure client SPA (spec §9) — keep `page.tsx` files as server components where the content doesn't need client state.
- Mobile-first responsive (spec §9, project `CLAUDE.md`).
- The anonymous device UUID is generated once and persisted in `localStorage` (spec §9); it must keep working (in-memory fallback) when `localStorage` is unavailable.
- A guess cannot be submitted until that attempt's audio has reached the browser's real `playing` event — not a click, not `canplaythrough`, not `loadedmetadata` (spec §8).
- No WebSockets; one request/response per action, no background polling loop (spec §7).
- The backend is the sole source of truth for game state; the frontend never stores or infers the answer (spec §7).
- All UI copy is original, natural, Uruguayan-voiced Spanish — not generic AI marketing copy (explicit user feedback on the reviewed reference material).
- Visual design: "Bricolage Grotesque" (titles, 700/800) + "Plus Jakarta Sans" (UI, 400-700); color tokens `--bo-purple #7547EB`, `--bo-yellow #FFD747`, `--bo-coral #FF817E`, `--bo-mint #9DE1BC`, `--bo-ink #25212E`, `--bo-paper #FFF9EF` — approved direction derived from the user's TEMITA mockup reference.
- Reuse the 33-asset SVG kit and the two OFL-licensed font families from the reviewed reference material as-is (original, already-approved assets); do not generate new AI images for them.
- Every component is small and single-purpose, written as clean multi-line, readable code — explicitly NOT the single-line, undecomposed JSX style of the reviewed reference material.
- `NEXT_PUBLIC_API_BASE_URL` env var for all API calls (established pattern, see `frontend/app/HealthStatus.tsx`).
- TDD throughout: pytest-django for backend, Vitest + Testing Library for frontend.
- Out of scope for this plan (explicitly deferred to later plans): score submission (`POST /api/daily/score/`), the display-name/share-card screen, localStorage streak tracking, the leaderboard and archive pages, and the "Batallas" multiplayer mode (separately deferred by the user — not part of the MVP).

## Review Focus

1. `localStorage` is unavailable (private browsing, blocked storage) when generating the device id — the game must still work for that page load instead of crashing.
2. `GET /api/daily/` returns 404 (no published song today) — the screen must show a friendly empty state, not an unhandled error.
3. The daily state loads already `finished: true` (the device already played today, e.g. the tab was reopened) — the screen must render the final result immediately and never show the guess form.
4. Audio fails to load or play (network error, unsupported source) — the submit control must stay disabled and the player must show a retry affordance, not get stuck disabled with no explanation.
5. Submitting a guess fails over the network (the backend rejects it, or the request itself fails) — the typed/selected song must not be silently lost, and the error must be visible so the player can retry.

---

### Task 1: Backend additions — song search endpoint and guessed-text history

**Files:**
- Create: `backend/catalog/views.py`
- Create: `backend/catalog/urls.py`
- Create: `backend/catalog/tests/test_views.py`
- Modify: `backend/config/urls.py`
- Modify: `backend/gameplay/views.py:66-83` (`DailyView.get`, the `feedback_history` list)
- Modify: `backend/gameplay/tests/test_api_daily.py`

**Interfaces:**
- Produces: `GET /api/songs/` → `{"songs": [{"id": int, "title": str, "artist": str}, ...]}`, ordered by title. Consumed by Task 4 (`listSongs`).
- Produces: each entry of `GET /api/daily/`'s `feedback_history` now also includes `"guessed_text": str` (the title the player guessed on that attempt), alongside the existing `attempt_number` and `feedback`. Consumed by Task 8 (`AttemptsTable`) and Task 9 (`GameScreen`).

- [ ] **Step 1: Write the failing tests for the song list endpoint**

```python
# backend/catalog/tests/test_views.py
import pytest
from django.urls import reverse

from catalog.models import Album, Artist, Song


@pytest.mark.django_db
def test_song_list_returns_every_song_ordered_by_title(client):
    artist = Artist.objects.create(mbid="artist-1", name="Jorge Drexler")
    album = Album.objects.create(mbid="album-1", name="Vaivén", artist=artist)
    Song.objects.create(mbid="song-2", title="Zafar", album=album)
    Song.objects.create(mbid="song-1", title="A las nueve", album=album)

    response = client.get(reverse("catalog:song-list"))

    assert response.status_code == 200
    assert response.json() == {
        "songs": [
            {
                "id": Song.objects.get(title="A las nueve").id,
                "title": "A las nueve",
                "artist": "Jorge Drexler",
            },
            {
                "id": Song.objects.get(title="Zafar").id,
                "title": "Zafar",
                "artist": "Jorge Drexler",
            },
        ]
    }


@pytest.mark.django_db
def test_song_list_is_empty_when_catalog_has_no_songs(client):
    response = client.get(reverse("catalog:song-list"))

    assert response.status_code == 200
    assert response.json() == {"songs": []}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest catalog/tests/test_views.py -v`
Expected: FAIL — `NoReverseMatch` (the `catalog` URL namespace doesn't exist yet).

- [ ] **Step 3: Implement the song list endpoint**

```python
# backend/catalog/views.py
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Song


class SongListView(APIView):
    def get(self, request):
        songs = Song.objects.select_related("album__artist").order_by("title")
        return Response(
            {
                "songs": [
                    {"id": song.id, "title": song.title, "artist": song.album.artist.name}
                    for song in songs
                ]
            }
        )
```

```python
# backend/catalog/urls.py
from django.urls import path

from .views import SongListView

app_name = "catalog"

urlpatterns = [
    path("songs/", SongListView.as_view(), name="song-list"),
]
```

```python
# backend/config/urls.py
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("catalog.urls")),
    path("api/", include("gameplay.urls")),
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && pytest catalog/tests/test_views.py -v`
Expected: PASS (2/2).

- [ ] **Step 5: Write the failing test for `guessed_text` in `feedback_history`**

Add to `backend/gameplay/tests/test_api_daily.py` (it already imports `GuessAttempt`, uses the `published_today`/`target_song` fixtures and the `DEVICE_ID` constant — see the existing file):

```python
@pytest.mark.django_db
def test_daily_includes_the_guessed_song_title_in_feedback_history(client, published_today):
    GuessAttempt.objects.create(
        device_id=DEVICE_ID,
        daily_song=published_today,
        attempt_number=1,
        guessed_text="Otra canción",
        is_correct=False,
        feedback={"year": "unknown", "genre": "unknown", "artist": "unknown", "album": "unknown"},
    )

    response = client.get(reverse("gameplay:daily"), HTTP_X_DEVICE_ID=DEVICE_ID)

    assert response.json()["feedback_history"][0]["guessed_text"] == "Otra canción"
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd backend && pytest gameplay/tests/test_api_daily.py -v -k guessed_song_title`
Expected: FAIL — `KeyError: 'guessed_text'`.

- [ ] **Step 7: Add `guessed_text` to the serialized history**

In `backend/gameplay/views.py`, change the `feedback_history` entry inside `DailyView.get` (currently at lines 78-80):

```python
                "feedback_history": [
                    {
                        "attempt_number": a.attempt_number,
                        "guessed_text": a.guessed_text,
                        "feedback": a.feedback,
                    }
                    for a in attempts
                ],
```

- [ ] **Step 8: Run the new test, then the full gameplay suite**

Run: `cd backend && pytest gameplay/tests/test_api_daily.py -v -k guessed_song_title`
Expected: PASS.

Run: `cd backend && pytest gameplay/ catalog/ -v`
Expected: all pass. If any existing test asserts an exact dict for `feedback_history` without `guessed_text`, update that assertion to include it — the field is an addition, not a behavior change, so no other test should need logic changes.

- [ ] **Step 9: Commit**

```bash
git add backend/catalog/views.py backend/catalog/urls.py backend/catalog/tests/test_views.py backend/config/urls.py backend/gameplay/views.py backend/gameplay/tests/test_api_daily.py
git commit -m "feat(api): add song list endpoint and guessed_text in daily history

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Design tokens and graphic kit assets

**Files:**
- Create: `frontend/public/assets/**` (33 SVGs, copied from `_referencia-frontend.zip`)
- Create: `frontend/public/fonts/**` (Bricolage Grotesque + Plus Jakarta Sans `.ttf` files and their `OFL.txt` licenses, copied from the same zip)
- Create: `frontend/app/globals.css`
- Create: `frontend/app/design-tokens.test.ts`
- Modify: `frontend/app/layout.tsx`

**Interfaces:**
- Produces: CSS custom properties `--bo-purple`, `--bo-yellow`, `--bo-coral`, `--bo-mint`, `--bo-ink`, `--bo-paper` and the `"Bricolage Grotesque"` / `"Plus Jakarta Sans"` font families, available globally once `layout.tsx` imports `globals.css`. Consumed by every component task below (as class names/font-family references, not by importing TypeScript).
- Produces: static files under `frontend/public/assets/<category>/<name>.svg` and `frontend/public/fonts/<name>.ttf`, referenced by `<img src="/assets/...">` and `@font-face` `url("/fonts/...")`.

- [ ] **Step 1: Write the failing design-tokens test**

```ts
// frontend/app/design-tokens.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf-8");

describe("design tokens", () => {
  test("defines the approved color palette as custom properties", () => {
    expect(css).toContain("--bo-purple: #7547eb");
    expect(css).toContain("--bo-yellow: #ffd747");
    expect(css).toContain("--bo-coral: #ff817e");
    expect(css).toContain("--bo-mint: #9de1bc");
    expect(css).toContain("--bo-ink: #25212e");
    expect(css).toContain("--bo-paper: #fff9ef");
  });

  test("declares the two approved typefaces via @font-face", () => {
    expect(css).toContain('font-family: "Bricolage Grotesque"');
    expect(css).toContain('font-family: "Plus Jakarta Sans"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/design-tokens.test.ts`
Expected: FAIL — `globals.css` doesn't exist yet (`ENOENT`).

- [ ] **Step 3: Copy the approved assets and fonts**

```bash
cd /Users/pinyverde/studio/banda-oriental
mkdir -p frontend/public/assets frontend/public/fonts /tmp/bo-kit-extract
unzip -oq _referencia-frontend.zip "frontend/public/assets/*" "frontend/public/fonts/*" -d /tmp/bo-kit-extract
cp -r /tmp/bo-kit-extract/frontend/public/assets/. frontend/public/assets/
cp -r /tmp/bo-kit-extract/frontend/public/fonts/. frontend/public/fonts/
rm -rf /tmp/bo-kit-extract
```

- [ ] **Step 4: Write `globals.css`**

```css
/* frontend/app/globals.css */

@font-face {
  font-family: "Bricolage Grotesque";
  src: url("/fonts/bricolage-700.ttf") format("truetype");
  font-weight: 700;
  font-display: swap;
}

@font-face {
  font-family: "Bricolage Grotesque";
  src: url("/fonts/bricolage-800.ttf") format("truetype");
  font-weight: 800;
  font-display: swap;
}

@font-face {
  font-family: "Plus Jakarta Sans";
  src: url("/fonts/jakarta-400.ttf") format("truetype");
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: "Plus Jakarta Sans";
  src: url("/fonts/jakarta-500.ttf") format("truetype");
  font-weight: 500;
  font-display: swap;
}

@font-face {
  font-family: "Plus Jakarta Sans";
  src: url("/fonts/jakarta-600.ttf") format("truetype");
  font-weight: 600;
  font-display: swap;
}

@font-face {
  font-family: "Plus Jakarta Sans";
  src: url("/fonts/jakarta-700.ttf") format("truetype");
  font-weight: 700;
  font-display: swap;
}

:root {
  --bo-purple: #7547eb;
  --bo-yellow: #ffd747;
  --bo-coral: #ff817e;
  --bo-mint: #9de1bc;
  --bo-ink: #25212e;
  --bo-paper: #fff9ef;
  --bo-font-display: "Bricolage Grotesque", sans-serif;
  --bo-font-body: "Plus Jakarta Sans", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bo-paper);
  color: var(--bo-ink);
  font-family: var(--bo-font-body);
  -webkit-font-smoothing: antialiased;
}

h1,
h2 {
  font-family: var(--bo-font-display);
  margin: 0;
}

p {
  margin: 0;
}

button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 0;
  background: none;
}

button:disabled {
  cursor: not-allowed;
}

button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 3px solid var(--bo-purple);
  outline-offset: 3px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Import the stylesheet in the root layout**

```tsx
// frontend/app/layout.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Banda Oriental",
  description: "El Wordle diario de canciones uruguayas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Run to verify it passes, and verify the assets landed**

Run: `cd frontend && npx vitest run app/design-tokens.test.ts`
Expected: PASS (2/2).

Run: `find frontend/public/assets -name "*.svg" | wc -l`
Expected: `33`.

Run: `ls frontend/public/fonts`
Expected: includes `bricolage-700.ttf`, `bricolage-800.ttf`, `jakarta-400.ttf`, `jakarta-500.ttf`, `jakarta-600.ttf`, `jakarta-700.ttf`, `bricolage-OFL.txt`, `jakarta-OFL.txt`.

- [ ] **Step 7: Commit**

```bash
git add frontend/public/assets frontend/public/fonts frontend/app/globals.css frontend/app/design-tokens.test.ts frontend/app/layout.tsx
git commit -m "feat(frontend): add design tokens, graphic kit, and approved fonts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Device identity utility

**Files:**
- Create: `frontend/app/lib/device-id.ts`
- Create: `frontend/app/lib/device-id.test.ts`

**Interfaces:**
- Produces: `getDeviceId(): string` — returns a UUID, creating and persisting one in `localStorage` under the key `"banda-oriental:device-id"` on first call, and the same value on every later call. Falls back to a stable in-memory value if `localStorage` throws. Consumed by Task 9 (`GameScreen`).

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/app/lib/device-id.test.ts
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("getDeviceId", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  test("creates and persists a UUID on first call", async () => {
    const { getDeviceId } = await import("./device-id");
    const id = getDeviceId();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(window.localStorage.getItem("banda-oriental:device-id")).toBe(id);
  });

  test("returns the same id on a later call", async () => {
    const { getDeviceId } = await import("./device-id");
    const first = getDeviceId();
    const second = getDeviceId();

    expect(second).toBe(first);
  });

  test("reuses the id already stored from a previous visit", async () => {
    window.localStorage.setItem("banda-oriental:device-id", "11111111-1111-1111-1111-111111111111");
    const { getDeviceId } = await import("./device-id");

    expect(getDeviceId()).toBe("11111111-1111-1111-1111-111111111111");
  });

  test("falls back to a stable in-memory id when localStorage throws", async () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const { getDeviceId } = await import("./device-id");

    const first = getDeviceId();
    const second = getDeviceId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
    getItemSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/lib/device-id.test.ts`
Expected: FAIL — `Cannot find module './device-id'`.

- [ ] **Step 3: Implement `getDeviceId`**

```ts
// frontend/app/lib/device-id.ts
const STORAGE_KEY = "banda-oriental:device-id";

let memoryDeviceId: string | null = null;

function createUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID. This id only
  // needs to tell anonymous devices apart — it is never used as a secret.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      memoryDeviceId = stored;
      return stored;
    }
    const created = createUuid();
    window.localStorage.setItem(STORAGE_KEY, created);
    memoryDeviceId = created;
    return created;
  } catch {
    // localStorage unavailable (private browsing, blocked storage, etc.)
    // — fall back to an in-memory id so the game still works for this
    // page load (Review Focus #1).
    memoryDeviceId = createUuid();
    return memoryDeviceId;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run app/lib/device-id.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/lib/device-id.ts frontend/app/lib/device-id.test.ts
git commit -m "feat(frontend): add device identity utility

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Typed API client

**Files:**
- Create: `frontend/app/lib/api.ts`
- Create: `frontend/app/lib/api.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (each function takes `deviceId: string` as a parameter rather than calling `getDeviceId()` itself, to keep it independently testable).
- Produces: `ApiError`, `StemInfo`, `GuessFeedback`, `AttemptHistoryEntry`, `DailyStateInProgress`, `DailyStateFinished`, `DailyState`, `GuessResult`, `SongOption` types; `getDailyState(deviceId): Promise<DailyState | null>`, `submitGuess(deviceId, attemptNumber, songId): Promise<GuessResult>`, `listSongs(): Promise<SongOption[]>`. Consumed by Task 8 (`AttemptsTable`'s prop types) and Task 9 (`GameScreen`).

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/app/lib/api.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, getDailyState, listSongs, submitGuess } from "./api";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDailyState", () => {
  test("returns the parsed state on success", async () => {
    mockFetchOnce(200, { finished: false, day: "2026-10-02" });

    const state = await getDailyState("device-1");

    expect(state).toEqual({ finished: false, day: "2026-10-02" });
  });

  test("returns null when no song is published today", async () => {
    mockFetchOnce(404, { detail: "No hay canción publicada para hoy." });

    expect(await getDailyState("device-1")).toBeNull();
  });

  test("throws ApiError with the backend's message on other failures", async () => {
    mockFetchOnce(400, { detail: "El header X-Device-Id es requerido." });

    await expect(getDailyState("")).rejects.toMatchObject({
      message: "El header X-Device-Id es requerido.",
      status: 400,
    });
  });

  test("sends the device id header", async () => {
    mockFetchOnce(200, { finished: false });

    await getDailyState("device-abc");

    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.headers["X-Device-Id"]).toBe("device-abc");
  });
});

describe("submitGuess", () => {
  test("posts the attempt number and song id as JSON", async () => {
    mockFetchOnce(200, {
      is_correct: true,
      attempt_number: 1,
      feedback: { year: "exact", genre: "same", artist: "same", album: "same" },
      finished: true,
      attempts_remaining: 5,
    });

    await submitGuess("device-1", 1, 42);

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/api/daily/guess/");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ attempt_number: 1, song_id: 42 });
  });

  test("throws ApiError on a rejected guess", async () => {
    mockFetchOnce(400, { detail: "Ya jugaste hoy." });

    await expect(submitGuess("device-1", 1, 42)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("listSongs", () => {
  test("unwraps the songs array", async () => {
    mockFetchOnce(200, { songs: [{ id: 1, title: "Zafar", artist: "No Te Va Gustar" }] });

    const songs = await listSongs();

    expect(songs).toEqual([{ id: 1, title: "Zafar", artist: "No Te Va Gustar" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/lib/api.test.ts`
Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 3: Implement the API client**

```ts
// frontend/app/lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface StemInfo {
  stem_type: "drums" | "bass" | "vocals" | "other";
  unlock_order: number;
  url: string;
}

export interface GuessFeedback {
  year: "exact" | "older" | "newer" | "unknown";
  genre: "same" | "different" | "unknown";
  artist: "same" | "different" | "unknown";
  album: "same" | "different" | "unknown";
}

export interface AttemptHistoryEntry {
  attempt_number: number;
  guessed_text: string;
  feedback: GuessFeedback;
}

export interface DailyStateInProgress {
  finished: false;
  day: string;
  attempt_number: number;
  attempts_remaining: number;
  unlocked_stems: StemInfo[];
  feedback_history: AttemptHistoryEntry[];
}

export interface DailyStateFinished {
  finished: true;
  day: string;
  won: boolean;
  score_submitted: boolean;
  song: { title: string; artist: string; album: string };
  score?: number;
  winning_attempt?: number;
}

export type DailyState = DailyStateInProgress | DailyStateFinished;

export interface GuessResult {
  is_correct: boolean;
  attempt_number: number;
  feedback: GuessFeedback;
  finished: boolean;
  attempts_remaining: number;
}

export interface SongOption {
  id: number;
  title: string;
  artist: string;
}

async function parseErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body.detail === "string" ? body.detail : "Error inesperado.";
  } catch {
    return "Error inesperado.";
  }
}

export async function getDailyState(deviceId: string): Promise<DailyState | null> {
  const response = await fetch(`${API_BASE_URL}/api/daily/`, {
    headers: { "X-Device-Id": deviceId },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(await parseErrorDetail(response), response.status);
  return response.json();
}

export async function submitGuess(
  deviceId: string,
  attemptNumber: number,
  songId: number
): Promise<GuessResult> {
  const response = await fetch(`${API_BASE_URL}/api/daily/guess/`, {
    method: "POST",
    headers: { "X-Device-Id": deviceId, "Content-Type": "application/json" },
    body: JSON.stringify({ attempt_number: attemptNumber, song_id: songId }),
  });
  if (!response.ok) throw new ApiError(await parseErrorDetail(response), response.status);
  return response.json();
}

export async function listSongs(): Promise<SongOption[]> {
  const response = await fetch(`${API_BASE_URL}/api/songs/`, { cache: "force-cache" });
  if (!response.ok) throw new ApiError(await parseErrorDetail(response), response.status);
  const data: { songs: SongOption[] } = await response.json();
  return data.songs;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run app/lib/api.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/lib/api.ts frontend/app/lib/api.test.ts
git commit -m "feat(frontend): add typed API client for the daily game

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Icon component

**Files:**
- Create: `frontend/app/ui/Icon.tsx`
- Create: `frontend/app/ui/Icon.test.tsx`

**Interfaces:**
- Produces: `Icon({ name, size? })` and the exported type `IconName`. Consumed by Task 6 (`AudioPlayer`) and Task 7 (`SongSearch`).

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/app/ui/Icon.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Icon } from "./Icon";

describe("Icon", () => {
  test("renders an svg sized by the size prop", () => {
    const { container } = render(<Icon name="play" size={18} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
  });

  test("defaults to size 22 when no size is given", () => {
    const { container } = render(<Icon name="check" />);

    expect(container.querySelector("svg")).toHaveAttribute("width", "22");
  });

  test("is hidden from assistive tech, since it is always paired with visible text", () => {
    const { container } = render(<Icon name="check" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/ui/Icon.test.tsx`
Expected: FAIL — `Cannot find module './Icon'`.

- [ ] **Step 3: Implement the icon component**

```tsx
// frontend/app/ui/Icon.tsx
const ICON_PATHS = {
  play: "m9 5 11 7-11 7Z",
  pause: "M8 5v14M16 5v14",
  reset: "M4 9a8 8 0 1 1 0 7M4 3v6h6",
  search: "M20 20l-5-5m2-6a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  lock: "M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4",
} as const;

export type IconName = keyof typeof ICON_PATHS;

interface IconProps {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 22 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "play" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run app/ui/Icon.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/ui/Icon.tsx frontend/app/ui/Icon.test.tsx
git commit -m "feat(frontend): add shared icon component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: AudioPlayer component

**Files:**
- Create: `frontend/app/ui/AudioPlayer.tsx`
- Create: `frontend/app/ui/AudioPlayer.test.tsx`

**Interfaces:**
- Consumes: `Icon` from Task 5.
- Produces: `AudioPlayer({ src, unlockedCount, onReady })`. `src` is the URL of the current attempt's stem (the single highest-`unlock_order` file from `unlocked_stems` — the admin prepares each stem file as a cumulative mix, per the workflow agreed with the user, so the frontend never needs to layer multiple `<audio>` elements). `onReady(ready: boolean)` fires `true` only after the browser's real `playing` event, and `false` on pause/error/src change. Consumed by Task 9 (`GameScreen`), which gates the guess submit button on it (spec §8).

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/app/ui/AudioPlayer.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AudioPlayer } from "./AudioPlayer";

beforeEach(() => {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
});

describe("AudioPlayer", () => {
  test("does not report ready just from clicking play", () => {
    const onReady = vi.fn();
    render(<AudioPlayer src="/stem.mp3" unlockedCount={1} onReady={onReady} />);

    fireEvent.click(screen.getByRole("button", { name: /reproducir audio/i }));

    expect(onReady).not.toHaveBeenCalledWith(true);
  });

  test("reports ready only after the native playing event fires", () => {
    const onReady = vi.fn();
    const { container } = render(<AudioPlayer src="/stem.mp3" unlockedCount={1} onReady={onReady} />);

    fireEvent.playing(container.querySelector("audio")!);

    expect(onReady).toHaveBeenLastCalledWith(true);
  });

  test("reports not-ready again when playback pauses", () => {
    const onReady = vi.fn();
    const { container } = render(<AudioPlayer src="/stem.mp3" unlockedCount={1} onReady={onReady} />);
    const audio = container.querySelector("audio")!;

    fireEvent.playing(audio);
    fireEvent.pause(audio);

    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  test("shows a retry affordance and keeps the guess gated when playback errors", () => {
    const onReady = vi.fn();
    const { container } = render(<AudioPlayer src="/stem.mp3" unlockedCount={1} onReady={onReady} />);

    fireEvent.error(container.querySelector("audio")!);

    expect(screen.getByRole("button", { name: /reintentar audio/i })).toBeInTheDocument();
    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  test("resets the ready flag when the src changes to a new attempt's stem", () => {
    const onReady = vi.fn();
    const { container, rerender } = render(
      <AudioPlayer src="/stem-1.mp3" unlockedCount={1} onReady={onReady} />
    );
    fireEvent.playing(container.querySelector("audio")!);
    expect(onReady).toHaveBeenLastCalledWith(true);

    rerender(<AudioPlayer src="/stem-2.mp3" unlockedCount={2} onReady={onReady} />);

    expect(onReady).toHaveBeenLastCalledWith(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/ui/AudioPlayer.test.tsx`
Expected: FAIL — `Cannot find module './AudioPlayer'`.

- [ ] **Step 3: Implement the audio player**

```tsx
// frontend/app/ui/AudioPlayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";

const STEM_LABELS = ["Batería", "Bajo", "Otros instrumentos", "Voz"];

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

interface AudioPlayerProps {
  src: string;
  unlockedCount: number;
  onReady: (ready: boolean) => void;
}

export function AudioPlayer({ src, unlockedCount, onReady }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<PlaybackState>("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    // A new stem (a new attempt) must never inherit the previous
    // attempt's "ready" signal — spec §8 requires every attempt's own
    // audio to have actually played before that attempt can be submitted.
    setState("idle");
    setPosition(0);
    onReady(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (state === "playing") {
      audio.pause();
      return;
    }
    setState("loading");
    onReady(false);
    try {
      await audio.play();
    } catch {
      setState("error");
      onReady(false);
    }
  }

  return (
    <section className="audio-player" aria-label="Pista de audio">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onPlaying={() => {
          setState("playing");
          onReady(true);
        }}
        onWaiting={() => setState("loading")}
        onPause={() => {
          setState((current) => (current === "error" ? "error" : "paused"));
          onReady(false);
        }}
        onEnded={() => {
          setState("idle");
          setPosition(0);
          onReady(false);
        }}
        onError={() => {
          setState("error");
          onReady(false);
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      />
      <button
        type="button"
        className="audio-player__toggle"
        onClick={togglePlayback}
        aria-label={
          state === "playing"
            ? "Pausar audio"
            : state === "error"
              ? "Reintentar audio"
              : "Reproducir audio"
        }
      >
        <Icon name={state === "playing" ? "pause" : state === "error" ? "reset" : "play"} size={26} />
      </button>
      <div className="audio-player__timeline" aria-hidden="true">
        <div
          className="audio-player__progress"
          style={{ width: duration ? `${(position / duration) * 100}%` : "0%" }}
        />
      </div>
      <span className="audio-player__time">
        {formatTime(position)} / {duration ? formatTime(duration) : "—"}
      </span>
      <p className="audio-player__status" role="status">
        {state === "error"
          ? "No se pudo reproducir el audio. Tocá para reintentar."
          : state === "loading"
            ? "Cargando audio…"
            : `Pista ${unlockedCount} de 4: ${STEM_LABELS[unlockedCount - 1]}`}
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run app/ui/AudioPlayer.test.tsx`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/ui/AudioPlayer.tsx frontend/app/ui/AudioPlayer.test.tsx
git commit -m "feat(frontend): add audio player gated on real playback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: SongSearch combobox

**Files:**
- Create: `frontend/app/ui/SongSearch.tsx`
- Create: `frontend/app/ui/SongSearch.test.tsx`

**Interfaces:**
- Consumes: `Icon` from Task 5, `SongOption` type from Task 4.
- Produces: `SongSearch({ songs, onSelect, disabled })`, calling `onSelect(song: SongOption)` when a result is chosen (click or Enter). Consumed by Task 9 (`GameScreen`).

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/app/ui/SongSearch.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SongSearch } from "./SongSearch";

const SONGS = [
  { id: 1, title: "Zafar", artist: "No Te Va Gustar" },
  { id: 2, title: "A las nueve", artist: "El Cuarteto de Nos" },
];

describe("SongSearch", () => {
  test("filters songs by title or artist as the user types", () => {
    render(<SongSearch songs={SONGS} onSelect={vi.fn()} disabled={false} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cuarteto" } });

    expect(screen.getByText("A las nueve")).toBeInTheDocument();
    expect(screen.queryByText("Zafar")).not.toBeInTheDocument();
  });

  test("shows a no-results message for an unmatched query", () => {
    render(<SongSearch songs={SONGS} onSelect={vi.fn()} disabled={false} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "xyz-no-existe" } });

    expect(screen.getByText(/no encontramos esa canción/i)).toBeInTheDocument();
  });

  test("calls onSelect and clears the query when a result is clicked", () => {
    const onSelect = vi.fn();
    render(<SongSearch songs={SONGS} onSelect={onSelect} disabled={false} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
    fireEvent.click(screen.getByText("Zafar"));

    expect(onSelect).toHaveBeenCalledWith(SONGS[0]);
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  test("selects the active result on Enter", () => {
    const onSelect = vi.fn();
    render(<SongSearch songs={SONGS} onSelect={onSelect} disabled={false} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalled();
  });

  test("is disabled while the audio has not started playing yet", () => {
    render(<SongSearch songs={SONGS} onSelect={vi.fn()} disabled={true} />);

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/ui/SongSearch.test.tsx`
Expected: FAIL — `Cannot find module './SongSearch'`.

- [ ] **Step 3: Implement the combobox**

```tsx
// frontend/app/ui/SongSearch.tsx
"use client";

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "./Icon";
import type { SongOption } from "../lib/api";

function matchesQuery(song: SongOption, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return (
    song.title.toLowerCase().includes(normalized) || song.artist.toLowerCase().includes(normalized)
  );
}

interface SongSearchProps {
  songs: SongOption[];
  onSelect: (song: SongOption) => void;
  disabled: boolean;
}

export function SongSearch({ songs, onSelect, disabled }: SongSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  const results = songs.filter((song) => matchesQuery(song, query)).slice(0, 8);

  function choose(song: SongOption) {
    onSelect(song);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="song-search">
      <label htmlFor="song-search-input" className="sr-only">
        Buscá una canción o artista
      </label>
      <div className="song-search__field">
        <Icon name="search" size={18} />
        <input
          id="song-search-input"
          value={query}
          disabled={disabled}
          placeholder="Escribí una canción o artista…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setOpen(false)}
        />
      </div>
      {open && query.trim() && (
        <ul id={listboxId} role="listbox" className="song-search__results">
          {results.length > 0 ? (
            results.map((song, index) => (
              <li
                key={song.id}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(song)}
              >
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </li>
            ))
          ) : (
            <li role="presentation" className="song-search__empty">
              No encontramos esa canción en el catálogo.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run app/ui/SongSearch.test.tsx`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/ui/SongSearch.tsx frontend/app/ui/SongSearch.test.tsx
git commit -m "feat(frontend): add accessible song search combobox

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: AttemptsTable component

**Files:**
- Create: `frontend/app/ui/AttemptsTable.tsx`
- Create: `frontend/app/ui/AttemptsTable.test.tsx`

**Interfaces:**
- Consumes: `AttemptHistoryEntry` type from Task 4 (now including `guessed_text`, per Task 1).
- Produces: `AttemptsTable({ attempts, maxAttempts })`, rendering one row per entry in `attempts` and empty placeholder rows up to `maxAttempts`. Consumed by Task 9 (`GameScreen`).

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/app/ui/AttemptsTable.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AttemptsTable } from "./AttemptsTable";

const FEEDBACK = { year: "older", genre: "same", artist: "different", album: "unknown" } as const;

describe("AttemptsTable", () => {
  test("renders one row per recorded attempt with its guessed song", () => {
    render(
      <AttemptsTable
        attempts={[{ attempt_number: 1, guessed_text: "Zafar", feedback: FEEDBACK }]}
        maxAttempts={6}
      />
    );

    expect(screen.getByText("Zafar")).toBeInTheDocument();
  });

  test("pads remaining rows up to maxAttempts as empty", () => {
    render(<AttemptsTable attempts={[]} maxAttempts={6} />);

    expect(screen.getAllByLabelText(/intento \d disponible/i)).toHaveLength(6);
  });

  test("marks an exact year match distinctly from a mismatch", () => {
    render(
      <AttemptsTable
        attempts={[{ attempt_number: 1, guessed_text: "Zafar", feedback: { ...FEEDBACK, year: "exact" } }]}
        maxAttempts={6}
      />
    );

    expect(screen.getByText("Año exacto")).toHaveClass("attempts-table__cell--match");
  });

  test("labels an unknown axis without implying a match or a miss", () => {
    render(
      <AttemptsTable
        attempts={[{ attempt_number: 1, guessed_text: "Zafar", feedback: FEEDBACK }]}
        maxAttempts={6}
      />
    );

    expect(screen.getByText("Sin dato")).toHaveClass("attempts-table__cell--unknown");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/ui/AttemptsTable.test.tsx`
Expected: FAIL — `Cannot find module './AttemptsTable'`.

- [ ] **Step 3: Implement the table**

```tsx
// frontend/app/ui/AttemptsTable.tsx
import { Icon } from "./Icon";
import type { AttemptHistoryEntry } from "../lib/api";

const FEEDBACK_LABEL: Record<string, string> = {
  exact: "Año exacto",
  older: "Es más vieja",
  newer: "Es más nueva",
  same: "Coincide",
  different: "No coincide",
  unknown: "Sin dato",
};

function feedbackClass(value: string): string {
  if (value === "exact" || value === "same") return "attempts-table__cell--match";
  if (value === "unknown") return "attempts-table__cell--unknown";
  return "attempts-table__cell--miss";
}

interface AttemptsTableProps {
  attempts: AttemptHistoryEntry[];
  maxAttempts: number;
}

export function AttemptsTable({ attempts, maxAttempts }: AttemptsTableProps) {
  const rows = Array.from({ length: maxAttempts }, (_, index) => attempts[index] ?? null);

  return (
    <table className="attempts-table">
      <caption className="sr-only">Tus intentos de hoy, con las pistas de cada uno.</caption>
      <thead>
        <tr>
          <th scope="col">Canción</th>
          <th scope="col">Año</th>
          <th scope="col">Género</th>
          <th scope="col">Artista</th>
          <th scope="col">Disco</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((entry, index) =>
          entry ? (
            <tr key={entry.attempt_number}>
              <td>{entry.guessed_text}</td>
              <td className={feedbackClass(entry.feedback.year)}>
                {entry.feedback.year === "exact" && <Icon name="check" size={16} />}
                {FEEDBACK_LABEL[entry.feedback.year]}
              </td>
              <td className={feedbackClass(entry.feedback.genre)}>{FEEDBACK_LABEL[entry.feedback.genre]}</td>
              <td className={feedbackClass(entry.feedback.artist)}>{FEEDBACK_LABEL[entry.feedback.artist]}</td>
              <td className={feedbackClass(entry.feedback.album)}>{FEEDBACK_LABEL[entry.feedback.album]}</td>
            </tr>
          ) : (
            <tr key={`empty-${index}`}>
              <td colSpan={5} className="attempts-table__empty" aria-label={`Intento ${index + 1} disponible`}>
                <span aria-hidden="true">—</span>
              </td>
            </tr>
          )
        )}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run app/ui/AttemptsTable.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/ui/AttemptsTable.tsx frontend/app/ui/AttemptsTable.test.tsx
git commit -m "feat(frontend): add attempts table mapped to the 4 feedback axes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: GameScreen and the `/jugar` page

**Files:**
- Create: `frontend/app/jugar/page.tsx`
- Create: `frontend/app/jugar/GameScreen.tsx`
- Create: `frontend/app/jugar/GameScreen.test.tsx`
- Modify: `frontend/app/globals.css` (styling for the classes used by this screen and its child components)

**Interfaces:**
- Consumes: `getDeviceId` (Task 3); `ApiError`, `getDailyState`, `submitGuess`, `listSongs`, `DailyState`, `SongOption` (Task 4); `AudioPlayer` (Task 6); `SongSearch` (Task 7); `AttemptsTable` (Task 8).
- Produces: the `/jugar` route. Terminal for this plan — no later task consumes it.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/app/jugar/GameScreen.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GameScreen } from "./GameScreen";
import * as api from "../lib/api";
import { getDeviceId } from "../lib/device-id";

vi.mock("../lib/device-id", () => ({ getDeviceId: vi.fn(() => "device-1") }));
vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof api>("../lib/api");
  return { ...actual, getDailyState: vi.fn(), listSongs: vi.fn(), submitGuess: vi.fn() };
});

const SONGS = [{ id: 1, title: "Zafar", artist: "No Te Va Gustar" }];

const IN_PROGRESS_STATE = {
  finished: false as const,
  day: "2026-10-02",
  attempt_number: 1,
  attempts_remaining: 6,
  unlocked_stems: [{ stem_type: "drums" as const, unlock_order: 1, url: "/stem-1.mp3" }],
  feedback_history: [],
};

beforeEach(() => {
  vi.mocked(getDeviceId).mockReturnValue("device-1");
  vi.mocked(api.listSongs).mockResolvedValue(SONGS);
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
});

describe("GameScreen", () => {
  test("shows a friendly message when there is no published song today", async () => {
    vi.mocked(api.getDailyState).mockResolvedValue(null);

    render(<GameScreen />);

    expect(await screen.findByText(/todavía no hay canción publicada/i)).toBeInTheDocument();
  });

  test("renders the finished state directly without showing the guess form", async () => {
    vi.mocked(api.getDailyState).mockResolvedValue({
      finished: true,
      day: "2026-10-02",
      won: true,
      score_submitted: false,
      song: { title: "Zafar", artist: "No Te Va Gustar", album: "La Teoría del Desorden" },
    });

    render(<GameScreen />);

    expect(await screen.findByText(/la adivinaste/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("shows a retryable error when the daily state request fails", async () => {
    vi.mocked(api.getDailyState).mockRejectedValue(new api.ApiError("Error del servidor", 500));

    render(<GameScreen />);

    expect(await screen.findByText("Error del servidor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  test("keeps the submit button disabled until the audio has actually started playing", async () => {
    vi.mocked(api.getDailyState).mockResolvedValue(IN_PROGRESS_STATE);

    render(<GameScreen />);
    await screen.findByRole("combobox");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
    fireEvent.click(await screen.findByText("Zafar"));

    expect(screen.getByRole("button", { name: /enviar intento/i })).toBeDisabled();
  });

  test("submits the selected song once audio is playing and shows the finished result", async () => {
    vi.mocked(api.getDailyState)
      .mockResolvedValueOnce(IN_PROGRESS_STATE)
      .mockResolvedValueOnce({
        finished: true,
        day: "2026-10-02",
        won: true,
        score_submitted: false,
        song: { title: "Zafar", artist: "No Te Va Gustar", album: "La Teoría del Desorden" },
      });
    vi.mocked(api.submitGuess).mockResolvedValue({
      is_correct: true,
      attempt_number: 1,
      feedback: { year: "exact", genre: "same", artist: "same", album: "same" },
      finished: true,
      attempts_remaining: 5,
    });

    const { container } = render(<GameScreen />);
    await screen.findByRole("combobox");
    fireEvent.playing(container.querySelector("audio")!);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
    fireEvent.click(await screen.findByText("Zafar"));
    fireEvent.click(screen.getByRole("button", { name: /enviar intento/i }));

    expect(await screen.findByText(/la adivinaste/i)).toBeInTheDocument();
    expect(api.submitGuess).toHaveBeenCalledWith("device-1", 1, 1);
  });

  test("shows an error and keeps the attempt retryable when submitting fails", async () => {
    vi.mocked(api.getDailyState).mockResolvedValue(IN_PROGRESS_STATE);
    vi.mocked(api.submitGuess).mockRejectedValue(new api.ApiError("Número de intento inválido.", 400));

    const { container } = render(<GameScreen />);
    await screen.findByRole("combobox");
    fireEvent.playing(container.querySelector("audio")!);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zafar" } });
    fireEvent.click(await screen.findByText("Zafar"));
    fireEvent.click(screen.getByRole("button", { name: /enviar intento/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Número de intento inválido.");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run app/jugar/GameScreen.test.tsx`
Expected: FAIL — `Cannot find module './GameScreen'`.

- [ ] **Step 3: Implement `GameScreen`**

```tsx
// frontend/app/jugar/GameScreen.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { getDeviceId } from "../lib/device-id";
import { ApiError, getDailyState, listSongs, submitGuess } from "../lib/api";
import type { DailyState, SongOption } from "../lib/api";
import { AudioPlayer } from "../ui/AudioPlayer";
import { SongSearch } from "../ui/SongSearch";
import { AttemptsTable } from "../ui/AttemptsTable";

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "no-song-today" }
  | { status: "ready"; daily: DailyState; songs: SongOption[] };

const MAX_ATTEMPTS = 6;

export function GameScreen() {
  const [screen, setScreen] = useState<ScreenState>({ status: "loading" });
  const [canGuess, setCanGuess] = useState(false);
  const [selectedSong, setSelectedSong] = useState<SongOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const load = useCallback(async () => {
    setScreen({ status: "loading" });
    const deviceId = getDeviceId();
    try {
      const [daily, songs] = await Promise.all([getDailyState(deviceId), listSongs()]);
      if (daily === null) {
        setScreen({ status: "no-song-today" });
        return;
      }
      setScreen({ status: "ready", daily, songs });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "No pudimos conectarnos. Probá de nuevo.";
      setScreen({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    if (screen.status !== "ready" || screen.daily.finished || !selectedSong || !canGuess) return;
    setSubmitting(true);
    setSubmitError("");
    const deviceId = getDeviceId();
    const attemptNumber = screen.daily.attempt_number;
    try {
      const result = await submitGuess(deviceId, attemptNumber, selectedSong.id);
      setSelectedSong(null);
      if (result.finished) {
        await load();
        return;
      }
      const daily = await getDailyState(deviceId);
      if (daily) setScreen({ status: "ready", daily, songs: screen.songs });
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : "No pudimos enviar tu intento. Probá de nuevo."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (screen.status === "loading") {
    return <p role="status">Cargando el juego de hoy…</p>;
  }

  if (screen.status === "error") {
    return (
      <div className="game-screen__error">
        <p>{screen.message}</p>
        <button type="button" onClick={load}>
          Reintentar
        </button>
      </div>
    );
  }

  if (screen.status === "no-song-today") {
    return <p>Todavía no hay canción publicada para hoy. Volvé más tarde.</p>;
  }

  const { daily, songs } = screen;

  if (daily.finished) {
    return (
      <section className="game-screen__result" aria-live="polite">
        <h1>{daily.won ? "¡La adivinaste!" : "No llegaste a tiempo"}</h1>
        <p>
          Era <strong>{daily.song.title}</strong>, de {daily.song.artist}.
        </p>
      </section>
    );
  }

  const currentStem = daily.unlocked_stems[daily.unlocked_stems.length - 1];

  return (
    <section className="game-screen">
      <h1>¿Qué canción es?</h1>
      {currentStem && (
        <AudioPlayer
          key={currentStem.url}
          src={currentStem.url}
          unlockedCount={daily.unlocked_stems.length}
          onReady={setCanGuess}
        />
      )}
      <AttemptsTable attempts={daily.feedback_history} maxAttempts={MAX_ATTEMPTS} />
      <SongSearch songs={songs} onSelect={setSelectedSong} disabled={!canGuess || submitting} />
      <button
        type="button"
        disabled={!selectedSong || !canGuess || submitting}
        onClick={handleSubmit}
      >
        Enviar intento
      </button>
      {submitError && <p role="alert">{submitError}</p>}
      <p className="game-screen__hint">
        {canGuess
          ? selectedSong
            ? `Vas a responder: ${selectedSong.title}`
            : "Elegí una canción de la lista."
          : "Escuchá la pista antes de responder."}
      </p>
    </section>
  );
}
```

```tsx
// frontend/app/jugar/page.tsx
import type { Metadata } from "next";
import { GameScreen } from "./GameScreen";

export const metadata: Metadata = {
  title: "Jugar — Banda Oriental",
  description: "Adiviná la canción uruguaya de hoy en seis intentos.",
};

export default function JugarPage() {
  return (
    <main>
      <GameScreen />
    </main>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run app/jugar/GameScreen.test.tsx`
Expected: PASS (6/6).

- [ ] **Step 5: Apply visual styling**

Append to `frontend/app/globals.css` (building on the tokens from Task 2):

```css
.game-screen {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  display: grid;
  gap: 20px;
}

.game-screen h1 {
  font-size: 32px;
  letter-spacing: -0.5px;
}

.game-screen__error,
.game-screen__result {
  max-width: 640px;
  margin: 48px auto;
  padding: 24px;
  text-align: center;
  background: color-mix(in srgb, var(--bo-mint) 35%, var(--bo-paper));
  border-radius: 20px;
}

.game-screen__hint {
  font-size: 13px;
  color: color-mix(in srgb, var(--bo-ink) 60%, transparent);
  text-align: center;
}

.audio-player {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  background: color-mix(in srgb, var(--bo-purple) 10%, var(--bo-paper));
  border-radius: 32px;
  padding: 12px 20px;
}

.audio-player__toggle {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: var(--bo-purple);
  color: var(--bo-paper);
  display: grid;
  place-items: center;
}

.audio-player__timeline {
  height: 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--bo-purple) 20%, var(--bo-paper));
  overflow: hidden;
}

.audio-player__progress {
  height: 100%;
  background: var(--bo-purple);
}

.audio-player__time {
  font-size: 12px;
  white-space: nowrap;
}

.audio-player__status {
  grid-column: 1 / -1;
  font-size: 12px;
  color: color-mix(in srgb, var(--bo-ink) 60%, transparent);
}

.song-search {
  position: relative;
}

.song-search__field {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1.5px solid color-mix(in srgb, var(--bo-purple) 35%, transparent);
  border-radius: 40px;
  padding: 12px 18px;
}

.song-search__field input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  color: var(--bo-ink);
}

.song-search__results {
  position: absolute;
  z-index: 5;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 6px;
  list-style: none;
  background: var(--bo-paper);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(37, 33, 46, 0.15);
  max-height: 260px;
  overflow: auto;
}

.song-search__results li {
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.song-search__results li[aria-selected="true"],
.song-search__results li:hover {
  background: color-mix(in srgb, var(--bo-purple) 15%, transparent);
}

.attempts-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 6px;
  font-size: 12px;
}

.attempts-table th {
  text-align: left;
  font-weight: 600;
  color: color-mix(in srgb, var(--bo-ink) 60%, transparent);
  padding: 0 10px;
}

.attempts-table td {
  padding: 10px;
  background: color-mix(in srgb, var(--bo-ink) 4%, var(--bo-paper));
}

.attempts-table__cell--match {
  background: var(--bo-mint) !important;
}

.attempts-table__cell--miss {
  background: color-mix(in srgb, var(--bo-coral) 45%, var(--bo-paper)) !important;
}

.attempts-table__cell--unknown {
  background: color-mix(in srgb, var(--bo-ink) 8%, var(--bo-paper)) !important;
}

.attempts-table__empty {
  color: color-mix(in srgb, var(--bo-ink) 30%, transparent);
  text-align: center;
}
```

Run `cd frontend && npm run dev` and open `/jugar` in a browser to confirm the layout renders sensibly on both a phone-width viewport and desktop. This step has no automated test — CSS has no behavior to assert in jsdom — so correctness here is a manual visual check, not a red/green cycle. Full visual polish (the sidebar, blobs, doodles, streak/stats panels from the approved kit) is deliberately left for a dedicated follow-up pass once this screen is running end-to-end against the real backend.

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: all tests pass, including every component from Tasks 3-9.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/jugar frontend/app/globals.css
git commit -m "feat(frontend): add the /jugar daily game screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
