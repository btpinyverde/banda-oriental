# Bootstrap + Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo skeleton (Django backend + React/TS frontend) with a working health-check round trip, deployed automatically on every push to `main`, proving the whole Vercel/Render/Neon/R2 pipeline works before any game feature is built on top of it.

**Architecture:** Monorepo with `backend/` (Django + DRF, Render) and `frontend/` (React + TypeScript via Vite, Vercel). A single `/api/health/` endpoint verifies the backend can reach the real Postgres database; the frontend fetches it and renders the result. No game logic, no MusicBrainz, no R2 usage yet — this plan only proves the deploy pipeline and DB connectivity.

**Tech Stack:** Django 5.1 + Django REST Framework, pytest + pytest-django, Postgres (Neon), React 18 + TypeScript via Vite, Vitest + React Testing Library, a local git `pre-push` hook as the test gate (no GitHub Actions — see Task 3), Render (backend hosting), Vercel (frontend hosting).

**Spec:** `docs/superpowers/specs/2026-10-02-banda-oriental-design.md`

## Global Constraints

- Default branch is `main`; it is the production branch on both Render and Vercel (push to `main` → auto-deploy).
- No Docker — Render native Python runtime (per spec §13).
- Backend must fail fast with a clear error if `DATABASE_URL` is missing in production; it must never fall back silently to sqlite outside local dev.
- Frontend must read the API base URL from an environment variable (`NEXT_PUBLIC_API_BASE_URL`), never hardcode `localhost`.
- CORS must allow exactly the deployed frontend origin(s) — no wildcard `*` in production.

## Review Focus

- Neon database asleep/unreachable on a cold request → health endpoint must return `503` with a clear body, not an unhandled 500.
- Render free-tier cold start (~30-50s) on the first request of the day → frontend must show a visible loading state the whole time, not appear frozen or blank.
- Missing `DATABASE_URL` in production → Django must refuse to start with a clear `ImproperlyConfigured` error, not crash obscurely later.
- Frontend built with the wrong/missing `NEXT_PUBLIC_API_BASE_URL` → the health check must show an explicit "no se pudo contactar al servidor" error, not a silent blank screen.
- CORS misconfigured (frontend origin not allowed) → covered by an explicit test asserting the configured origin list, so a future change can't accidentally reopen or lock out the frontend.

---

### Task 1: Backend skeleton + health endpoint

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/requirements-dev.txt`
- Create: `backend/manage.py`
- Create: `backend/config/__init__.py`
- Create: `backend/config/settings/__init__.py`
- Create: `backend/config/settings/base.py`
- Create: `backend/config/settings/dev.py`
- Create: `backend/config/settings/prod.py`
- Create: `backend/config/urls.py`
- Create: `backend/config/wsgi.py`
- Create: `backend/core/__init__.py`
- Create: `backend/core/apps.py`
- Create: `backend/core/views.py`
- Create: `backend/core/urls.py`
- Create: `backend/pytest.ini`
- Test: `backend/core/tests/__init__.py`
- Test: `backend/core/tests/test_health.py`
- Test: `backend/core/tests/test_settings.py`

**Interfaces:**
- Produces: `GET /api/health/` → `200 {"status": "ok", "db": "ok"}` on success, `503 {"status": "error", "db": "unreachable"}` when the DB raises `OperationalError`.
- Produces: `config.settings.dev` / `config.settings.prod` as the two settings modules selected via `DJANGO_SETTINGS_MODULE`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/core/tests/test_health.py
from unittest.mock import patch

import pytest
from django.db.utils import OperationalError
from django.urls import reverse
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_health_returns_ok_when_db_reachable():
    client = APIClient()
    response = client.get(reverse("health"))
    assert response.status_code == 200
    assert response.data == {"status": "ok", "db": "ok"}


def test_health_returns_503_when_db_unreachable():
    client = APIClient()
    with patch("core.views.connection") as mock_connection:
        mock_connection.cursor.side_effect = OperationalError("could not connect")
        response = client.get(reverse("health"))
    assert response.status_code == 503
    assert response.data == {"status": "error", "db": "unreachable"}
```

```python
# backend/core/tests/test_settings.py
import importlib
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured


def _reload_prod_settings():
    sys.modules.pop("config.settings.prod", None)
    return importlib.import_module("config.settings.prod")


def test_prod_settings_require_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("ALLOWED_HOSTS", "example.com")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://example.com")
    with pytest.raises(ImproperlyConfigured, match="DATABASE_URL"):
        _reload_prod_settings()


def test_prod_settings_require_cors_allowed_origins(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@host/db")
    monkeypatch.setenv("ALLOWED_HOSTS", "example.com")
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
    with pytest.raises(ImproperlyConfigured, match="CORS_ALLOWED_ORIGINS"):
        _reload_prod_settings()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && DJANGO_SETTINGS_MODULE=config.settings.dev python -m pytest core/tests/ -v`
Expected: `ModuleNotFoundError: No module named 'core'` (nothing exists yet).

- [ ] **Step 3: Write the Django project skeleton**

```python
# backend/manage.py
#!/usr/bin/env python
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Is it installed and "
            "available on your PYTHONPATH environment variable?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

```python
# backend/config/settings/base.py
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "core",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

LANGUAGE_CODE = "es-uy"
TIME_ZONE = "America/Montevideo"
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
```

```python
# backend/config/settings/dev.py
from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
    }
}

if not CORS_ALLOWED_ORIGINS:  # noqa: F405
    CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]
```

```python
# backend/config/settings/prod.py
import os

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

DEBUG = False

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise ImproperlyConfigured(
        "DATABASE_URL is required in production and was not set."
    )

DATABASES = {
    "default": dj_database_url.parse(database_url, conn_max_age=600, ssl_require=True)
}

allowed_hosts = os.environ.get("ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [h.strip() for h in allowed_hosts.split(",") if h.strip()]
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS is required in production.")

if not CORS_ALLOWED_ORIGINS:  # noqa: F405
    raise ImproperlyConfigured(
        "CORS_ALLOWED_ORIGINS is required in production."
    )
```

```python
# backend/config/urls.py
from django.urls import include, path

urlpatterns = [
    path("api/", include("core.urls")),
]
```

```python
# backend/config/wsgi.py
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
application = get_wsgi_application()
```

```python
# backend/core/apps.py
from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
```

```python
# backend/core/views.py
from django.db import OperationalError, connection
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except OperationalError:
            return Response({"status": "error", "db": "unreachable"}, status=503)
        return Response({"status": "ok", "db": "ok"})
```

```python
# backend/core/urls.py
from django.urls import path

from .views import HealthView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
]
```

```ini
# backend/pytest.ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.dev
python_files = test_*.py
```

```
# backend/requirements.txt
Django==5.1.3
djangorestframework==3.15.2
dj-database-url==2.3.0
psycopg[binary]==3.2.3
gunicorn==23.0.0
django-cors-headers==4.4.0
```

```
# backend/requirements-dev.txt
-r requirements.txt
pytest==8.3.3
pytest-django==4.9.0
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pip install -r requirements-dev.txt && python -m pytest core/tests/ -v`
Expected: all 4 tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat(backend): add Django skeleton with DB-aware health endpoint"
```

---

### Task 2: Frontend skeleton + health status page (Next.js)

> **Context:** this task originally scaffolded a Vite SPA. Mid-plan, two
> real requirements surfaced that a pure client-side SPA can't satisfy:
> Google indexing (crawlers see an empty `<div>` until JS runs) and
> Open Graph previews for sharing on Instagram/Facebook (their bots don't
> execute JS, so meta tags must be in the server-rendered HTML). Next.js
> (App Router) solves both via SSR, so this task scaffolds Next.js
> instead of Vite+React. If you implemented the Vite version already,
> delete `frontend/` and start clean with this task.

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/page.tsx`
- Create: `frontend/app/HealthStatus.tsx`
- Create: `frontend/.env.example`
- Test: `frontend/app/HealthStatus.test.tsx`

**Interfaces:**
- Consumes: `GET {NEXT_PUBLIC_API_BASE_URL}/api/health/` from Task 1, response shape `{status: "ok" | "error", db: "ok" | "unreachable"}`.
- Produces: `<HealthStatus />` client component, rendering one of `"cargando..."`, `"ok"`, or `"no se pudo contactar al servidor"`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/app/HealthStatus.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthStatus } from "./HealthStatus";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HealthStatus", () => {
  it("shows loading state first", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})) // never resolves
    );
    render(<HealthStatus />);
    expect(screen.getByText("cargando...")).toBeInTheDocument();
  });

  it("shows ok when the backend responds healthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ok", db: "ok" }),
        })
      ) as unknown as typeof fetch
    );
    render(<HealthStatus />);
    await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
  });

  it("shows an error when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network error")))
    );
    render(<HealthStatus />);
    await waitFor(() =>
      expect(
        screen.getByText("no se pudo contactar al servidor")
      ).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm install && npm run test -- --run`
Expected: `Cannot find module './HealthStatus'`.

- [ ] **Step 3: Write the frontend skeleton**

```json
// frontend/package.json
{
  "name": "banda-oriental-frontend",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/node": "^22.7.5",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.2",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.3"
  }
}
```

```json
// frontend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "types": ["@testing-library/jest-dom"]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

```ts
// frontend/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

```ts
// frontend/vitest.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
  },
});
```

```ts
// frontend/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

```tsx
// frontend/app/layout.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

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

```tsx
// frontend/app/page.tsx
import { HealthStatus } from "./HealthStatus";

export default function Home() {
  return (
    <main>
      <h1>Banda Oriental</h1>
      <HealthStatus />
    </main>
  );
}
```

```tsx
// frontend/app/HealthStatus.tsx
"use client";

import { useEffect, useState } from "react";

type HealthState = "loading" | "ok" | "error";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export function HealthStatus() {
  const [state, setState] = useState<HealthState>("loading");

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/health/`)
      .then((response) => {
        if (!response.ok) throw new Error("unhealthy");
        return response.json();
      })
      .then((data: { status: string }) => {
        setState(data.status === "ok" ? "ok" : "error");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "loading") return <p>cargando...</p>;
  if (state === "error") return <p>no se pudo contactar al servidor</p>;
  return <p>ok</p>;
}
```

```
# frontend/.env.example
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

`frontend/next-env.d.ts` is not hand-written — `next dev`/`next build`
generates it automatically on first run. It gets committed once it
exists (standard Next.js convention), it's just not authored by hand.
`next build` also auto-patches `tsconfig.json` on first run (forces
`jsx: "react-jsx"`, adds a `.next/dev/types` include entry) — that's
expected, not a sign the authored file above was wrong; commit the
patched version.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- --run`
Expected: all 3 tests `PASS`.

- [ ] **Step 5: Run the production build to confirm Next.js itself is wired correctly**

Run: `cd frontend && npm run build`
Expected: build succeeds, generates `.next/` and `next-env.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): add Next.js skeleton with health status page"
```

---

### Task 3: Local pre-push test gate (git hook)

**Files:**
- Create: `.githooks/pre-push`
- Create: `README.md`

**Interfaces:**
- Consumes: `backend/.venv` (Task 1, local dev setup) and `frontend/` scripts (Task 2: `npm run test -- --run`, `npm run build`).
- Produces: a `git push` that aborts with a non-zero exit if backend tests, frontend tests, or the frontend build fail — enforced locally, no GitHub Actions, no billing dependency.

> **Context:** this plan originally used a GitHub Actions workflow here. GitHub locked the account's Actions billing (asked for a card to verify, even though public-repo minutes are free) and Brandon chose to avoid adding a card entirely rather than resolve the lock. A local pre-push hook gives the same practical guarantee for a solo developer — nothing reaches `origin` untested — without touching GitHub Actions or billing at all.

- [ ] **Step 1: Write the hook**

```bash
#!/bin/sh
# .githooks/pre-push — blocks `git push` if tests or the frontend build fail.
set -e

echo "pre-push: backend tests"
(cd backend && ./.venv/bin/python -m pytest)

echo "pre-push: frontend tests"
(cd frontend && npm run test -- --run)

echo "pre-push: frontend build"
(cd frontend && npm run build)

echo "pre-push: all checks passed"
```

```markdown
# README.md
# Banda Oriental

Wordle diario de canciones uruguayas. Backend en Django, frontend en React + TypeScript.

## Desarrollo local

### Backend

\`\`\`bash
cd backend
python3.12 -m venv .venv
./.venv/bin/pip install -r requirements-dev.txt
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py runserver
\`\`\`

### Frontend

\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

### Test gate antes de pushear

Este repo no usa GitHub Actions (ver nota en el plan de bootstrap). En su lugar, un
git hook local corre los tests de backend y frontend, y el build del frontend, antes
de cada `git push`. Para instalarlo una vez por clon del repo:

\`\`\`bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
\`\`\`

Si el hook falla, el push no sale — arreglá lo que rompió antes de reintentar.
```

- [ ] **Step 2: Make it executable and install it locally**

Run: `chmod +x .githooks/pre-push && git config core.hooksPath .githooks`
Expected: no output from `chmod`; `git config --get core.hooksPath` prints `.githooks`.

- [ ] **Step 3: Verify it actually blocks a failing push**

Temporarily break a test (e.g. change an assertion in `backend/core/tests/test_health.py` to something false), then run:

Run: `git add -A && git commit -m "wip: temp breakage to verify hook" --no-verify && git push --dry-run`
Expected: the hook runs, `pytest` fails, the push is aborted before reaching the network. Then `git reset --soft HEAD~1` to undo the temp commit and restore the test file.

- [ ] **Step 4: Commit the real hook and README**

```bash
git add .githooks/pre-push README.md
git commit -m "chore: replace GitHub Actions CI with a local pre-push test gate"
```

---

### Task 4: Provision Neon Postgres

**Files:**
- No new files — this task only provisions external infrastructure and produces a connection string consumed by Task 5.

**Interfaces:**
- Produces: a pooled Postgres connection string, handed to Task 5 as the `DATABASE_URL` value.

- [ ] **Step 1: Manual setup (Brandon, in the Neon dashboard)**

1. Create a Neon account (free tier, no expiring database).
2. Create a project named `banda-oriental`, region closest to Render's region (`us-east` if deploying Render in Oregon/Virginia).
3. Copy the pooled connection string (the one Neon labels for serverless/pooled connections) — this is the value Task 5 needs.

- [ ] **Step 2: Report the result**

No commit for this task (external provisioning only). Keep the connection string at hand for Task 5 — do not commit it anywhere in the repo.

---

### Task 5: Render blueprint and deploy for the backend

**Files:**
- Create: `render.yaml`
- Create: `backend/.env.example`

**Interfaces:**
- Consumes: the Neon connection string from Task 4.
- Produces: a deployed backend at `https://<service>.onrender.com`, with `GET /api/health/` returning `{"status": "ok", "db": "ok"}` against the real Neon database — consumed by Task 6 as `NEXT_PUBLIC_API_BASE_URL`.

- [ ] **Step 1: Write the blueprint**

```yaml
# render.yaml
services:
  - type: web
    name: banda-oriental-backend
    runtime: python
    plan: free
    rootDir: backend
    buildCommand: "pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate"
    startCommand: "gunicorn config.wsgi:application"
    envVars:
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
```

```
# backend/.env.example
SECRET_KEY=change-me
DATABASE_URL=postgres://user:password@host/dbname
ALLOWED_HOSTS=banda-oriental-backend.onrender.com
CORS_ALLOWED_ORIGINS=https://bandaoriental.xami.uy
```

- [ ] **Step 2: Commit**

```bash
git add render.yaml backend/.env.example
git commit -m "chore(infra): add Render blueprint for the backend"
```

- [ ] **Step 3: Manual setup (Brandon, in the Render dashboard)**

1. Create a Render account if you don't have one yet (no card required for the free plan).
2. "New" → "Blueprint" → connect the `banda-oriental` GitHub repo. Render reads `render.yaml` and proposes the `banda-oriental-backend` service.
3. Before the first deploy, fill in the real values: `SECRET_KEY` (generate one, e.g. `python -c "import secrets; print(secrets.token_urlsafe(50))"`), `DATABASE_URL` (the Neon string from Task 4), `ALLOWED_HOSTS` = `<service>.onrender.com`, and `CORS_ALLOWED_ORIGINS` — leave a placeholder Vercel URL for now and correct it after Task 6 if it changes.
4. Confirm the service's branch is `main` with auto-deploy enabled (it's the default for Blueprints).
5. Deploy and confirm `https://<service>.onrender.com/api/health/` returns `{"status": "ok", "db": "ok"}` — this proves Render is really talking to Neon, not falling back to anything local.

---

### Task 6: Vercel project for the frontend, on bandaoriental.xami.uy

**Files:**
- No new files — this task is Vercel dashboard configuration, DNS configuration in ANTEL's panel for `xami.uy`, plus verifying the existing `frontend/.env.example` is accurate.

**Interfaces:**
- Consumes: the Render backend URL from Task 5, as `NEXT_PUBLIC_API_BASE_URL`.
- Produces: the production site reachable at `https://bandaoriental.xami.uy`, consumed by the xami.uy homepage button (a separate, out-of-repo change Brandon makes on that site).

- [ ] **Step 1: Manual setup (Brandon, in the Vercel dashboard)**

1. Create a Vercel account if you don't have one yet.
2. "Add New..." → "Project" → import the `banda-oriental` GitHub repo.
3. Set "Root Directory" to `frontend`.
4. Framework preset: Next.js (Vercel should auto-detect it from `package.json`).
5. Add environment variable `NEXT_PUBLIC_API_BASE_URL` = the Render backend URL from Task 5 (`https://<service>.onrender.com`), scoped to "Production".
6. Confirm "Production Branch" is `main` (Vercel's default) so every push to `main` auto-deploys.
7. Deploy and open the resulting `*.vercel.app` URL — it should show "Banda Oriental" and, after the Render cold start, "ok".

- [ ] **Step 2: Add the custom domain in Vercel**

1. In the Vercel project → Settings → Domains → add `bandaoriental.xami.uy`.
2. Vercel shows the exact DNS record it needs (typically a `CNAME` for `bandaoriental` pointing to `cname.vercel-dns.com`, but use whatever Vercel displays — it can differ).

- [ ] **Step 3: Add the DNS record in ANTEL's panel**

1. Log into ANTEL's domain/DNS management panel for `xami.uy`.
2. Add the exact record type/name/value Vercel showed in Step 2 (a `CNAME` record for the `bandaoriental` subdomain).
3. Save. DNS propagation can take from minutes to a few hours.
4. Back in Vercel, wait for the domain to show "Valid Configuration" — this confirms propagation reached Vercel.

- [ ] **Step 4: Verify and lock down CORS**

1. Once `https://bandaoriental.xami.uy` resolves and shows "Banda Oriental" / "ok", go back to Render and update `CORS_ALLOWED_ORIGINS` to `https://bandaoriental.xami.uy` (not the `*.vercel.app` URL), then redeploy.
2. Re-check the site still shows "ok" after the CORS update (confirms the frontend's real production origin, not the Vercel preview URL, is what's allowed).

- [ ] **Step 5: Report the result**

Nothing to commit here — this task is purely dashboard/DNS configuration. Record the resulting production URL (`https://bandaoriental.xami.uy`) when reporting back; Plan 2 (catalog + sync) will build on this deployed skeleton. Adding the link button on the xami.uy homepage is a separate change in that site's own codebase, outside this plan.
