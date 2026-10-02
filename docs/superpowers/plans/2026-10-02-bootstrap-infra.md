# Bootstrap + Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo skeleton (Django backend + React/TS frontend) with a working health-check round trip, deployed automatically on every push to `main`, proving the whole Vercel/Render/Neon/R2 pipeline works before any game feature is built on top of it.

**Architecture:** Monorepo with `backend/` (Django + DRF, Render) and `frontend/` (React + TypeScript via Vite, Vercel). A single `/api/health/` endpoint verifies the backend can reach the real Postgres database; the frontend fetches it and renders the result. No game logic, no MusicBrainz, no R2 usage yet — this plan only proves the deploy pipeline and DB connectivity.

**Tech Stack:** Django 5.1 + Django REST Framework, pytest + pytest-django, Postgres (Neon), React 18 + TypeScript via Vite, Vitest + React Testing Library, GitHub Actions (CI), Render (backend hosting), Vercel (frontend hosting).

**Spec:** `docs/superpowers/specs/2026-10-02-banda-oriental-design.md`

## Global Constraints

- Default branch is `main`; it is the production branch on both Render and Vercel (push to `main` → auto-deploy).
- No Docker — Render native Python runtime (per spec §13).
- Backend must fail fast with a clear error if `DATABASE_URL` is missing in production; it must never fall back silently to sqlite outside local dev.
- Frontend must read the API base URL from an environment variable (`VITE_API_BASE_URL`), never hardcode `localhost`.
- CORS must allow exactly the deployed frontend origin(s) — no wildcard `*` in production.

## Review Focus

- Neon database asleep/unreachable on a cold request → health endpoint must return `503` with a clear body, not an unhandled 500.
- Render free-tier cold start (~30-50s) on the first request of the day → frontend must show a visible loading state the whole time, not appear frozen or blank.
- Missing `DATABASE_URL` in production → Django must refuse to start with a clear `ImproperlyConfigured` error, not crash obscurely later.
- Frontend built with the wrong/missing `VITE_API_BASE_URL` → the health check must show an explicit "no se pudo contactar al servidor" error, not a silent blank screen.
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

### Task 2: Frontend skeleton + health status page

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/HealthStatus.tsx`
- Create: `frontend/.env.example`
- Test: `frontend/src/HealthStatus.test.tsx`

**Interfaces:**
- Consumes: `GET {VITE_API_BASE_URL}/api/health/` from Task 1, response shape `{status: "ok" | "error", db: "ok" | "unreachable"}`.
- Produces: `<HealthStatus />` component, rendering one of `"cargando..."`, `"ok"`, or `"no se pudo contactar al servidor"`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/HealthStatus.test.tsx
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
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.2",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.8",
    "vitest": "^2.1.3"
  }
}
```

```json
// frontend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

```ts
// frontend/vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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

```html
<!-- frontend/index.html -->
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Banda Oriental</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// frontend/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```tsx
// frontend/src/App.tsx
import { HealthStatus } from "./HealthStatus";

export function App() {
  return (
    <main>
      <h1>Banda Oriental</h1>
      <HealthStatus />
    </main>
  );
}
```

```tsx
// frontend/src/HealthStatus.tsx
import { useEffect, useState } from "react";

type HealthState = "loading" | "ok" | "error";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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
VITE_API_BASE_URL=http://localhost:8000
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- --run`
Expected: all 3 tests `PASS`.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): add Vite/React skeleton with health status page"
```

---

### Task 3: CI pipeline (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `backend/requirements-dev.txt` (Task 1), `frontend/package.json` (Task 2).
- Produces: a required CI check named `backend-tests` and `frontend-tests` on every push/PR to `main`.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install -r requirements-dev.txt
      - run: python -m pytest -v

  frontend-tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run test -- --run
      - run: npm run build
```

- [ ] **Step 2: Verify it runs**

Run: `git add .github/workflows/ci.yml && git commit -m "ci: run backend and frontend tests on push/PR to main"`
Push the branch and confirm both jobs go green on GitHub Actions before merging.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run backend and frontend tests on push/PR to main"
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
- Produces: a deployed backend at `https://<service>.onrender.com`, with `GET /api/health/` returning `{"status": "ok", "db": "ok"}` against the real Neon database — consumed by Task 6 as `VITE_API_BASE_URL`.

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
CORS_ALLOWED_ORIGINS=https://banda-oriental.vercel.app
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

### Task 6: Vercel project for the frontend

**Files:**
- No new files — this task is Vercel dashboard configuration plus verifying the existing `frontend/.env.example` is accurate.

**Interfaces:**
- Consumes: the Render backend URL from Task 5, as `VITE_API_BASE_URL`.

- [ ] **Step 1: Manual setup (Brandon, in the Vercel dashboard)**

1. Create a Vercel account if you don't have one yet.
2. "Add New..." → "Project" → import the `banda-oriental` GitHub repo.
3. Set "Root Directory" to `frontend`.
4. Framework preset: Vite.
5. Add environment variable `VITE_API_BASE_URL` = the Render backend URL from Task 5 (`https://<service>.onrender.com`), scoped to "Production".
6. Confirm "Production Branch" is `main` (Vercel's default) so every push to `main` auto-deploys.
7. Deploy and open the resulting URL — it should show "Banda Oriental" and, after the Render cold start, "ok".
8. Go back to Render and update `CORS_ALLOWED_ORIGINS` to this real Vercel URL, then redeploy.

- [ ] **Step 2: Report the result**

Nothing to commit here — this task is purely dashboard configuration. Record the resulting production URL when reporting back; Plan 2 (catalog + sync) will build on this deployed skeleton.
