# Banda Oriental

Wordle diario de canciones uruguayas. Backend en Django, frontend en React + TypeScript.

## Desarrollo local

### Backend

```bash
cd backend
python3.12 -m venv .venv
./.venv/bin/pip install -r requirements-dev.txt
./.venv/bin/python manage.py migrate
./.venv/bin/python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Test gate antes de pushear

Este repo no usa GitHub Actions (ver nota en el plan de bootstrap, sección
Task 3). En su lugar, un git hook local corre los tests de backend y
frontend, y el build del frontend, antes de cada `git push`. Para
instalarlo una vez por clon del repo:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-push
```

Si el hook falla, el push no sale — arreglá lo que rompió antes de reintentar.
