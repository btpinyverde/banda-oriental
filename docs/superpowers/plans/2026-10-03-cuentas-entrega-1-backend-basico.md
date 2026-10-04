# Cuentas, entrega 1: backend básico — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el backend permita registrarse con correo y contraseña, confirmar el correo, entrar, cerrar sesión y ver la cuenta, con sesión por token.

**Architecture:** App nueva `accounts` con dos modelos (`AuthToken`, `EmailChallenge`) sobre el `User` de Django, una clase de autenticación DRF por encabezado `Authorization: Bearer`, y vistas bajo `/api/auth/` y `/api/me/`. Los tokens y los enlaces de correo se guardan hasheados (SHA-256) y los enlaces son de un solo uso. Esta entrega no toca el juego ni envía correo real.

**Tech Stack:** Django 5.1, Django REST Framework 3.15, pytest-django, SQLite en dev/tests y Postgres (Neon) en producción.

**Spec:** `docs/superpowers/specs/2026-10-03-cuentas-design.md` (secciones 3, 4, 5 parcial y 9). Entregas 2 a 4 quedan fuera: enlace por correo, recuperar contraseña, límite de envíos, proveedor de correo real, juego con cuenta y front.

## Global Constraints

- El usuario es el `User` de Django; `username` = correo en minúsculas y sin espacios; `is_active` es false hasta confirmar.
- El correo no puede superar 150 caracteres (límite de `User.username`).
- Contraseña: mínimo 10 caracteres y los validadores de Django.
- Token de sesión: `secrets.token_urlsafe(32)`, guardado como SHA-256; se muestra una sola vez; vence a los 90 días sin uso.
- Enlace de confirmación: de un solo uso, vence a las 24 horas, guardado como SHA-256 y con el token en el **fragmento** de la URL (`/cuenta/entrar#token=...`).
- `register` responde siempre `202` con el mismo cuerpo, exista o no el correo.
- Si falta el encabezado `Authorization`, la API sigue funcionando como hoy (anónimo por `X-Device-Id`); esta entrega no cambia ninguna vista del juego.
- Texto de usuario en español rioplatense; código, nombres y comentarios en inglés (como el resto del backend).
- Sin cuenta de proveedor de correo todavía: en producción el backend de correo por defecto es `dummy` (no envía ni registra nada), nunca `console`, para que los enlaces no queden en los logs.

## Review Focus

Entradas o condiciones que la spec implica pero ninguna tarea cubriría sola, de la más a la menos probable. Cada una tiene su test en la tarea indicada.

1. Correo con mayúsculas o espacios (`" Ana@Example.COM "`) debe ser la misma cuenta que `ana@example.com` al registrarse y al entrar. → Tareas 3 y 4.
2. Encabezado `Authorization` malformado (`Bearer` solo, `Bearer a b`, `Basic xxx`, token inventado) debe dar `401`, nunca `500`. → Tarea 2.
3. Correo de más de 150 caracteres debe rechazarse con `400` (si no, revienta el `username` en la base). → Tarea 3.
4. Dos registros simultáneos con el mismo correo: el que pierde la carrera no debe dar `500` y debe responder igual `202`. → Tarea 3.
5. Registrarse de nuevo con un correo sin confirmar no debe cambiar la contraseña guardada (si no, alguien podría fijar la contraseña de una cuenta ajena antes de que se confirme). → Tarea 3.

---

## File Structure

- `backend/accounts/__init__.py`, `apps.py`: la app.
- `backend/accounts/models.py`: `AuthToken`, `EmailChallenge`, `hash_token`, `new_token`.
- `backend/accounts/authentication.py`: `BearerTokenAuthentication`.
- `backend/accounts/emails.py`: los dos correos de esta entrega (confirmar y "ya tenés cuenta").
- `backend/accounts/serializers.py`: validación de entrada (`RegisterSerializer`, `LoginSerializer`, `TokenSerializer`).
- `backend/accounts/views.py`: `RegisterView`, `ConfirmView`, `LoginView`, `LogoutView`, `MeView`.
- `backend/accounts/urls.py`: rutas; se incluye en `config/urls.py`.
- `backend/accounts/tests/`: `conftest.py` y un archivo de tests por tarea.
- `backend/config/settings/base.py` y `dev.py`: app instalada, validadores de contraseña, correo, `FRONTEND_URL`.
- `docs/contrato-api-cuentas.md`: contrato de los endpoints para el front.

## Convenciones de este plan

- Todos los comandos se corren desde `backend/` con el entorno del repo: `./.venv/bin/python -m pytest ...`. Si el worktree no tiene `.venv`, enlazarlo: `ln -s /Users/pinyverde/studio/banda-oriental/backend/.venv .venv`.
- Los tests usan `APIClient` y la fixture `mailoutbox` de pytest-django.
- Commits en inglés, con el pie `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: App, configuración y modelos

**Files:**
- Create: `backend/accounts/__init__.py` (vacío), `backend/accounts/apps.py`, `backend/accounts/models.py`, `backend/accounts/migrations/__init__.py` (vacío), `backend/accounts/tests/__init__.py` (vacío), `backend/accounts/tests/test_models.py`
- Modify: `backend/config/settings/base.py`, `backend/config/settings/dev.py`

**Interfaces:**
- Produces:
  - `hash_token(raw: str) -> str` (SHA-256 hex) y `new_token() -> str`.
  - `AuthToken.issue(user) -> str` (devuelve el token en claro), campos `user`, `key_hash`, `created_at`, `last_used_at`; `AuthToken.is_expired() -> bool`.
  - `EmailChallenge.issue(email: str, purpose: str) -> str` (token en claro) y `EmailChallenge.consume(raw: str, purpose: str) -> EmailChallenge | None` (atómico: marca como usado y devuelve el desafío, o `None` si no existe, ya se usó, venció o es de otro propósito). Constantes `CONFIRM`, `MAGIC`, `RESET`.
  - Settings: `FRONTEND_URL`, `DEFAULT_FROM_EMAIL`, `EMAIL_BACKEND`.

- [ ] **Step 1: Escribir los tests de los modelos**

`backend/accounts/tests/test_models.py`:

```python
from datetime import timedelta

import pytest
from accounts.models import AuthToken, EmailChallenge, hash_token
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user("ana@example.com", "ana@example.com", "una-clave-larga-1")


def test_issue_returns_the_raw_token_and_stores_only_its_hash(user):
    raw = AuthToken.issue(user)

    stored = AuthToken.objects.get(user=user)
    assert stored.key_hash == hash_token(raw)
    assert raw not in stored.key_hash
    assert len(raw) >= 40


def test_a_token_unused_for_91_days_is_expired(user):
    AuthToken.issue(user)
    token = AuthToken.objects.get(user=user)

    assert token.is_expired() is False
    token.last_used_at = timezone.now() - timedelta(days=91)
    assert token.is_expired() is True


def test_a_challenge_can_be_consumed_once(user):
    raw = EmailChallenge.issue("ana@example.com", EmailChallenge.CONFIRM)

    first = EmailChallenge.consume(raw, EmailChallenge.CONFIRM)
    second = EmailChallenge.consume(raw, EmailChallenge.CONFIRM)

    assert first is not None and first.email == "ana@example.com"
    assert second is None


def test_a_challenge_is_stored_hashed(db):
    raw = EmailChallenge.issue("ana@example.com", EmailChallenge.CONFIRM)

    assert EmailChallenge.objects.get().token_hash == hash_token(raw)


def test_a_challenge_does_not_work_for_another_purpose(db):
    raw = EmailChallenge.issue("ana@example.com", EmailChallenge.CONFIRM)

    assert EmailChallenge.consume(raw, EmailChallenge.RESET) is None
    # Y el intento equivocado no lo gasta.
    assert EmailChallenge.consume(raw, EmailChallenge.CONFIRM) is not None


def test_an_expired_challenge_is_rejected(db):
    raw = EmailChallenge.issue("ana@example.com", EmailChallenge.CONFIRM)
    EmailChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    assert EmailChallenge.consume(raw, EmailChallenge.CONFIRM) is None


def test_confirm_links_last_24_hours_and_the_others_15_minutes(db):
    EmailChallenge.issue("a@example.com", EmailChallenge.CONFIRM)
    EmailChallenge.issue("b@example.com", EmailChallenge.MAGIC)

    confirm = EmailChallenge.objects.get(email="a@example.com")
    magic = EmailChallenge.objects.get(email="b@example.com")
    assert confirm.expires_at - confirm.created_at == timedelta(hours=24)
    assert magic.expires_at - magic.created_at == timedelta(minutes=15)
```

- [ ] **Step 2: Correr y ver que falla**

Run: `./.venv/bin/python -m pytest accounts/tests/test_models.py -q`
Expected: error `No module named 'accounts'` (los tests no se pueden ni importar).

- [ ] **Step 3: Crear la app, la configuración y los modelos**

`backend/accounts/apps.py`:

```python
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"
```

`backend/accounts/models.py`:

```python
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

TOKEN_UNUSED_LIFETIME = timedelta(days=90)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class AuthToken(models.Model):
    """A login session. Only the hash is stored; the raw token is shown once, at creation."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="auth_tokens")
    key_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(default=timezone.now)

    @classmethod
    def issue(cls, user) -> str:
        raw = new_token()
        cls.objects.create(user=user, key_hash=hash_token(raw))
        return raw

    def is_expired(self) -> bool:
        return timezone.now() - self.last_used_at > TOKEN_UNUSED_LIFETIME


class EmailChallenge(models.Model):
    """A single-use emailed link (confirm the address, sign in, reset the password)."""

    CONFIRM = "confirm"
    MAGIC = "magic"
    RESET = "reset"
    PURPOSES = [(CONFIRM, "confirm"), (MAGIC, "magic"), (RESET, "reset")]
    LIFETIMES = {
        CONFIRM: timedelta(hours=24),
        MAGIC: timedelta(minutes=15),
        RESET: timedelta(minutes=15),
    }

    email = models.EmailField()
    purpose = models.CharField(max_length=10, choices=PURPOSES)
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    @classmethod
    def issue(cls, email: str, purpose: str) -> str:
        raw = new_token()
        cls.objects.create(
            email=email,
            purpose=purpose,
            token_hash=hash_token(raw),
            expires_at=timezone.now() + cls.LIFETIMES[purpose],
        )
        return raw

    @classmethod
    def consume(cls, raw: str, purpose: str):
        """Marks the link as used and returns it, or None if it is unknown, used, expired or for another purpose.

        The check and the mark happen in one UPDATE, so two simultaneous requests can't both consume it.
        """
        now = timezone.now()
        token_hash = hash_token(raw)
        updated = cls.objects.filter(
            token_hash=token_hash, purpose=purpose, used_at__isnull=True, expires_at__gt=now
        ).update(used_at=now)
        if updated == 0:
            return None
        return cls.objects.get(token_hash=token_hash)
```

En `backend/config/settings/base.py`: agregar `"accounts",` a `INSTALLED_APPS` (después de `"core",`) y, al final del archivo:

```python
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Base URL of the frontend, used to build the links in emails.
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Banda Oriental <no-reply@xami.uy>")
# There is no email provider yet. The dummy backend sends and logs nothing, so confirmation links never end up
# in production logs. Development overrides it with the console backend.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.dummy.EmailBackend")
```

En `backend/config/settings/dev.py`, al final:

```python
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
```

(agregar `import os` arriba si `dev.py` no lo tiene: `from .base import *` no exporta `os` de forma garantizada.)

Run: `./.venv/bin/python manage.py makemigrations accounts`
Expected: crea `accounts/migrations/0001_initial.py` con `AuthToken` y `EmailChallenge`.

- [ ] **Step 4: Correr los tests del archivo y la suite**

Run: `./.venv/bin/python -m pytest accounts/tests/test_models.py -q && ./.venv/bin/python -m pytest -q`
Expected: los 7 tests nuevos pasan; la suite completa sigue verde (135 + 7).

- [ ] **Step 5: Commit**

```bash
git add backend/accounts backend/config/settings
git commit -m "feat(backend): add accounts app with token and email challenge models

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Autenticación por token y `GET /api/me/`

**Files:**
- Create: `backend/accounts/authentication.py`, `backend/accounts/views.py`, `backend/accounts/urls.py`, `backend/accounts/tests/conftest.py`, `backend/accounts/tests/test_authentication.py`
- Modify: `backend/config/urls.py`

**Interfaces:**
- Consumes: `AuthToken`, `hash_token` (Tarea 1).
- Produces:
  - `BearerTokenAuthentication` (DRF): `request.user` = usuario, `request.auth` = la instancia de `AuthToken`. Sin `Authorization` o con un esquema que no es `Bearer` devuelve `None` (anónimo). `Bearer` malformado, desconocido, vencido o de un usuario inactivo lanza `AuthenticationFailed` (401, con `WWW-Authenticate: Bearer`).
  - `MeView` en `GET /api/me/` → `{"email": str, "date_joined": ISO 8601}`.
  - Fixtures de test: `api` (`APIClient`), `make_user(email, password, active=True)`, `auth_header(raw_token) -> dict` (para `api.get(..., **headers)`).

- [ ] **Step 1: Escribir los fixtures y los tests**

`backend/accounts/tests/conftest.py`:

```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()
PASSWORD = "una-clave-larga-1"


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def make_user(db):
    def _make(email="ana@example.com", password=PASSWORD, active=True):
        return User.objects.create_user(email, email, password, is_active=active)

    return _make


def auth_header(raw_token):
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}
```

`backend/accounts/tests/test_authentication.py`:

```python
from datetime import timedelta

import pytest
from accounts.models import AuthToken
from django.urls import reverse
from django.utils import timezone

from .conftest import auth_header

ME = "/api/me/"


def test_me_requires_a_token(api, db):
    response = api.get(ME)

    assert response.status_code == 401
    assert response["WWW-Authenticate"] == "Bearer"


def test_me_returns_the_account_for_a_valid_token(api, make_user):
    user = make_user("ana@example.com")
    raw = AuthToken.issue(user)

    response = api.get(ME, **auth_header(raw))

    assert response.status_code == 200
    assert response.data["email"] == "ana@example.com"
    assert "date_joined" in response.data


@pytest.mark.parametrize(
    "header",
    ["Bearer", "Bearer a b", "Bearer token-inventado", "Basic abc123", "abc"],
)
def test_a_malformed_or_unknown_authorization_header_is_a_401_never_a_500(api, db, header):
    response = api.get(ME, HTTP_AUTHORIZATION=header)

    assert response.status_code == 401


def test_the_token_of_an_inactive_user_is_rejected(api, make_user):
    user = make_user(active=False)
    raw = AuthToken.issue(user)

    assert api.get(ME, **auth_header(raw)).status_code == 401


def test_a_token_unused_for_91_days_is_rejected(api, make_user):
    raw = AuthToken.issue(make_user())
    AuthToken.objects.update(last_used_at=timezone.now() - timedelta(days=91))

    assert api.get(ME, **auth_header(raw)).status_code == 401


def test_using_a_token_refreshes_last_used_only_when_it_is_over_an_hour_old(api, make_user):
    raw = AuthToken.issue(make_user())
    recent = timezone.now() - timedelta(minutes=10)
    AuthToken.objects.update(last_used_at=recent)
    api.get(ME, **auth_header(raw))
    assert AuthToken.objects.get().last_used_at == recent

    old = timezone.now() - timedelta(days=3)
    AuthToken.objects.update(last_used_at=old)
    api.get(ME, **auth_header(raw))
    assert AuthToken.objects.get().last_used_at > old
```

- [ ] **Step 2: Correr y ver que falla**

Run: `./.venv/bin/python -m pytest accounts/tests/test_authentication.py -q`
Expected: FAIL; `/api/me/` responde 404 (la ruta no existe).

- [ ] **Step 3: Implementar**

`backend/accounts/authentication.py`:

```python
from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import AuthToken, hash_token

LAST_USED_REFRESH = timedelta(hours=1)


class BearerTokenAuthentication(BaseAuthentication):
    """`Authorization: Bearer <token>`. With no header (or another scheme) the request stays anonymous."""

    def authenticate(self, request):
        parts = request.headers.get("Authorization", "").split()
        if not parts or parts[0].lower() != "bearer":
            return None
        if len(parts) != 2:
            raise AuthenticationFailed("Token inválido.")

        token = AuthToken.objects.select_related("user").filter(key_hash=hash_token(parts[1])).first()
        if token is None or not token.user.is_active or token.is_expired():
            raise AuthenticationFailed("Token inválido.")

        # Not on every request: it would turn each read into a write.
        if timezone.now() - token.last_used_at > LAST_USED_REFRESH:
            token.last_used_at = timezone.now()
            token.save(update_fields=["last_used_at"])
        return token.user, token

    def authenticate_header(self, request):
        return "Bearer"
```

`backend/accounts/views.py`:

```python
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import BearerTokenAuthentication


class MeView(APIView):
    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"email": request.user.email, "date_joined": request.user.date_joined})
```

`backend/accounts/urls.py`:

```python
from django.urls import path

from .views import MeView

app_name = "accounts"

urlpatterns = [
    path("me/", MeView.as_view(), name="me"),
]
```

En `backend/config/urls.py`, agregar `path("api/", include("accounts.urls")),` después de la línea de `gameplay.urls`.

- [ ] **Step 4: Correr los tests y la suite**

Run: `./.venv/bin/python -m pytest accounts -q && ./.venv/bin/python -m pytest -q`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add backend/accounts backend/config/urls.py
git commit -m "feat(backend): bearer token authentication and GET /api/me/

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Registro y confirmación del correo

**Files:**
- Create: `backend/accounts/emails.py`, `backend/accounts/serializers.py`, `backend/accounts/tests/test_register_confirm.py`
- Modify: `backend/accounts/views.py`, `backend/accounts/urls.py`

**Interfaces:**
- Consumes: `AuthToken.issue`, `EmailChallenge.issue/consume`, `EmailChallenge.CONFIRM` (Tarea 1); fixtures `api`, `make_user`, `auth_header` (Tarea 2).
- Produces:
  - `POST /api/auth/register/` `{email, password}` → `202 {"detail": "Si el correo es válido, te enviamos un mensaje para continuar."}` siempre que la entrada sea válida; `400` con los errores de campo si no.
  - `POST /api/auth/confirm/` `{token}` → `200 {"token": "<sesión>"}` y activa al usuario; `400 {"detail": "El enlace no es válido o venció."}` si no sirve.
  - `normalize_email(value: str) -> str` (en `serializers.py`): `strip().lower()`.
  - `send_confirmation(email, raw_token)` y `send_already_registered(email)` (en `emails.py`). El enlace es `f"{settings.FRONTEND_URL}/cuenta/entrar#token={raw}&tipo=confirmar"`.

- [ ] **Step 1: Escribir los tests**

`backend/accounts/tests/test_register_confirm.py`:

```python
import re
from datetime import timedelta
from unittest.mock import patch

import pytest
from accounts.models import AuthToken, EmailChallenge
from django.contrib.auth import get_user_model
from django.utils import timezone

from .. import views
from .conftest import PASSWORD, auth_header

User = get_user_model()
REGISTER = "/api/auth/register/"
CONFIRM = "/api/auth/confirm/"
DETAIL = "Si el correo es válido, te enviamos un mensaje para continuar."


def token_from(mail):
    return re.search(r"#token=([\w-]+)", mail.body).group(1)


def register(api, email="ana@example.com", password=PASSWORD):
    return api.post(REGISTER, {"email": email, "password": password}, format="json")


def test_register_creates_an_inactive_user_and_emails_a_confirmation_link(api, db, mailoutbox):
    response = register(api)

    assert response.status_code == 202
    assert response.data == {"detail": DETAIL}
    user = User.objects.get(username="ana@example.com")
    assert user.is_active is False
    assert user.check_password(PASSWORD)
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["ana@example.com"]
    assert "/cuenta/entrar#token=" in mailoutbox[0].body
    assert "tipo=confirmar" in mailoutbox[0].body


def test_the_email_is_trimmed_and_lowercased(api, db, mailoutbox):
    register(api, email="  Ana@Example.COM ")

    assert User.objects.get().username == "ana@example.com"
    assert mailoutbox[0].to == ["ana@example.com"]


def test_registering_a_confirmed_email_answers_the_same_and_sends_no_confirmation_link(api, make_user, mailoutbox):
    make_user("ana@example.com")

    response = register(api, password="otra-clave-larga-2")

    assert response.status_code == 202
    assert response.data == {"detail": DETAIL}
    assert User.objects.count() == 1
    assert len(mailoutbox) == 1
    assert "#token=" not in mailoutbox[0].body
    assert not User.objects.get().check_password("otra-clave-larga-2")


def test_registering_an_unconfirmed_email_again_resends_the_link_and_keeps_the_old_password(api, make_user, mailoutbox):
    make_user("ana@example.com", active=False)

    response = register(api, password="clave-del-intruso-9")

    assert response.status_code == 202
    assert len(mailoutbox) == 1
    assert "#token=" in mailoutbox[0].body
    assert User.objects.get().check_password(PASSWORD)
    assert not User.objects.get().check_password("clave-del-intruso-9")


@pytest.mark.parametrize(
    "email, password, field",
    [
        ("no-es-un-correo", PASSWORD, "email"),
        ("", PASSWORD, "email"),
        (("a" * 140) + "@example.com", PASSWORD, "email"),
        ("ana@example.com", "corta1", "password"),
        ("ana@example.com", "1234567890", "password"),
        ("ana@example.com", "", "password"),
    ],
)
def test_invalid_input_is_a_400_on_the_right_field_and_sends_nothing(api, db, mailoutbox, email, password, field):
    response = register(api, email=email, password=password)

    assert response.status_code == 400
    assert field in response.data
    assert User.objects.count() == 0
    assert mailoutbox == []


def test_losing_a_race_for_the_same_email_still_answers_202(api, make_user, mailoutbox):
    # The account already exists, but this request's first lookup ran before it was created and saw nothing.
    make_user("ana@example.com", active=False)
    real_find_user = views.find_user
    stale_answers = [None]

    def stale_then_real(email):
        return stale_answers.pop() if stale_answers else real_find_user(email)

    with patch.object(views, "find_user", side_effect=stale_then_real):
        response = register(api, password="clave-del-intruso-9")

    assert response.status_code == 202
    assert User.objects.count() == 1
    assert User.objects.get().check_password(PASSWORD)
    assert len(mailoutbox) == 1


def test_confirming_activates_the_account_and_returns_a_working_session_token(api, db, mailoutbox):
    register(api)

    response = api.post(CONFIRM, {"token": token_from(mailoutbox[0])}, format="json")

    assert response.status_code == 200
    assert User.objects.get().is_active is True
    me = api.get("/api/me/", **auth_header(response.data["token"]))
    assert me.status_code == 200
    assert me.data["email"] == "ana@example.com"


def test_a_confirmation_link_works_only_once(api, db, mailoutbox):
    register(api)
    token = token_from(mailoutbox[0])
    api.post(CONFIRM, {"token": token}, format="json")

    again = api.post(CONFIRM, {"token": token}, format="json")

    assert again.status_code == 400
    assert again.data == {"detail": "El enlace no es válido o venció."}
    assert AuthToken.objects.count() == 1


def test_an_expired_confirmation_link_is_rejected_and_the_account_stays_inactive(api, db, mailoutbox):
    register(api)
    EmailChallenge.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

    response = api.post(CONFIRM, {"token": token_from(mailoutbox[0])}, format="json")

    assert response.status_code == 400
    assert User.objects.get().is_active is False


@pytest.mark.parametrize("body", [{"token": "inventado"}, {"token": ""}, {}])
def test_garbage_confirmation_tokens_are_a_400(api, db, body):
    assert api.post(CONFIRM, body, format="json").status_code == 400
```

- [ ] **Step 2: Correr y ver que falla**

Run: `./.venv/bin/python -m pytest accounts/tests/test_register_confirm.py -q`
Expected: FAIL; las rutas `/api/auth/...` responden 404.

- [ ] **Step 3: Implementar**

`backend/accounts/emails.py`:

```python
from django.conf import settings
from django.core.mail import send_mail


def _send(email: str, subject: str, body: str) -> None:
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [email])


def send_confirmation(email: str, raw_token: str) -> None:
    link = f"{settings.FRONTEND_URL}/cuenta/entrar#token={raw_token}&tipo=confirmar"
    _send(
        email,
        "Confirmá tu correo en Banda Oriental",
        "¡Hola!\n\n"
        "Para terminar de crear tu cuenta, confirmá tu correo con este enlace (sirve una sola vez y vence en 24 horas):\n\n"
        f"{link}\n\n"
        "Si no fuiste vos, ignorá este mensaje y no pasa nada.\n",
    )


def send_already_registered(email: str) -> None:
    _send(
        email,
        "Ya tenés una cuenta en Banda Oriental",
        "¡Hola!\n\n"
        "Alguien intentó crear una cuenta con este correo, pero ya tenés una. "
        f"Podés entrar desde {settings.FRONTEND_URL}/login.\n\n"
        "Si no fuiste vos, ignorá este mensaje y no pasa nada.\n",
    )
```

`backend/accounts/serializers.py`:

```python
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()
MAX_EMAIL_LENGTH = User._meta.get_field("username").max_length  # 150: the email is the username


def normalize_email(value: str) -> str:
    return value.strip().lower()


class EmailField(serializers.EmailField):
    def to_internal_value(self, data):
        return super().to_internal_value(normalize_email(data) if isinstance(data, str) else data)


class RegisterSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL_LENGTH)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)

    def validate(self, attrs):
        try:
            validate_password(attrs["password"], user=User(username=attrs["email"], email=attrs["email"]))
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)})
        return attrs


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200)
```

Reemplazar `backend/accounts/views.py` por:

```python
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import BearerTokenAuthentication
from .emails import send_already_registered, send_confirmation
from .models import AuthToken, EmailChallenge
from .serializers import RegisterSerializer, TokenSerializer

User = get_user_model()

REGISTER_DETAIL = "Si el correo es válido, te enviamos un mensaje para continuar."
BAD_LINK = {"detail": "El enlace no es válido o venció."}


def find_user(email):
    return User.objects.filter(username=email).first()


class PublicView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class RegisterView(PublicView):
    def post(self, request):
        data = RegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email, password = data.validated_data["email"], data.validated_data["password"]

        # Always the same answer, whether or not the email already has an account.
        user, created = self._get_or_create(email, password)
        if not created and user.is_active:
            send_already_registered(email)
        else:
            # New, or still unconfirmed: send the link. An existing unconfirmed account keeps its old password,
            # otherwise anyone could set the password of an account before its owner confirms it.
            send_confirmation(email, EmailChallenge.issue(email, EmailChallenge.CONFIRM))
        return Response({"detail": REGISTER_DETAIL}, status=status.HTTP_202_ACCEPTED)

    @staticmethod
    def _get_or_create(email, password):
        existing = find_user(email)
        if existing:
            return existing, False
        try:
            with transaction.atomic():
                return User.objects.create_user(email, email, password, is_active=False), True
        except IntegrityError:
            # Another request created it between our check and our insert.
            return find_user(email), False


class ConfirmView(PublicView):
    def post(self, request):
        data = TokenSerializer(data=request.data)
        if not data.is_valid():
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        challenge = EmailChallenge.consume(data.validated_data["token"], EmailChallenge.CONFIRM)
        user = find_user(challenge.email) if challenge else None
        if user is None:
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])
        return Response({"token": AuthToken.issue(user)})


class MeView(APIView):
    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"email": request.user.email, "date_joined": request.user.date_joined})
```

Reemplazar `backend/accounts/urls.py` por:

```python
from django.urls import path

from .views import ConfirmView, MeView, RegisterView

app_name = "accounts"

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/confirm/", ConfirmView.as_view(), name="confirm"),
    path("me/", MeView.as_view(), name="me"),
]
```

- [ ] **Step 4: Correr los tests y la suite**

Run: `./.venv/bin/python -m pytest accounts -q && ./.venv/bin/python -m pytest -q`
Expected: todo verde. Si el test de contraseña `"1234567890"` no falla por el validador numérico/común, revisar `AUTH_PASSWORD_VALIDATORS` de la Tarea 1.

- [ ] **Step 5: Commit**

```bash
git add backend/accounts
git commit -m "feat(backend): register and confirm the email address

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Entrar y cerrar sesión

**Files:**
- Create: `backend/accounts/tests/test_login_logout.py`
- Modify: `backend/accounts/serializers.py`, `backend/accounts/views.py`, `backend/accounts/urls.py`

**Interfaces:**
- Consumes: `normalize_email`, `EmailField` (Tarea 3); `AuthToken.issue`; fixtures de la Tarea 2.
- Produces:
  - `POST /api/auth/login/` `{email, password}` → `200 {"token"}`; `400 {"detail": "Correo o contraseña incorrectos."}` (mismo cuerpo para correo inexistente y contraseña errónea); `403 {"detail": "Confirmá tu correo antes de entrar.", "code": "email_not_confirmed"}` solo si la contraseña es correcta pero la cuenta no está confirmada.
  - `POST /api/auth/logout/` (con token) → `204` y borra solo el token usado; `401` sin token.

- [ ] **Step 1: Escribir los tests**

`backend/accounts/tests/test_login_logout.py`:

```python
from accounts.models import AuthToken

from .conftest import PASSWORD, auth_header

LOGIN = "/api/auth/login/"
LOGOUT = "/api/auth/logout/"
WRONG = {"detail": "Correo o contraseña incorrectos."}


def login(api, email="ana@example.com", password=PASSWORD):
    return api.post(LOGIN, {"email": email, "password": password}, format="json")


def test_login_returns_a_working_session_token(api, make_user):
    make_user("ana@example.com")

    response = login(api)

    assert response.status_code == 200
    assert api.get("/api/me/", **auth_header(response.data["token"])).status_code == 200


def test_login_ignores_case_and_surrounding_spaces_in_the_email(api, make_user):
    make_user("ana@example.com")

    assert login(api, email="  ANA@Example.com ").status_code == 200


def test_a_wrong_password_and_an_unknown_email_get_the_same_answer(api, make_user):
    make_user("ana@example.com")

    wrong_password = login(api, password="otra-clave-larga-2")
    unknown_email = login(api, email="nadie@example.com")

    assert wrong_password.status_code == unknown_email.status_code == 400
    assert wrong_password.data == unknown_email.data == WRONG
    assert AuthToken.objects.count() == 0


def test_an_unconfirmed_account_with_the_right_password_is_told_to_confirm(api, make_user):
    make_user("ana@example.com", active=False)

    response = login(api)

    assert response.status_code == 403
    assert response.data == {"detail": "Confirmá tu correo antes de entrar.", "code": "email_not_confirmed"}
    assert AuthToken.objects.count() == 0


def test_an_unconfirmed_account_with_the_wrong_password_is_not_told_anything_special(api, make_user):
    make_user("ana@example.com", active=False)

    response = login(api, password="otra-clave-larga-2")

    assert response.status_code == 400
    assert response.data == WRONG


def test_each_login_creates_its_own_session(api, make_user):
    make_user("ana@example.com")

    first, second = login(api).data["token"], login(api).data["token"]

    assert first != second
    assert AuthToken.objects.count() == 2


def test_logout_deletes_only_the_token_used(api, make_user):
    user = make_user("ana@example.com")
    first, second = AuthToken.issue(user), AuthToken.issue(user)

    response = api.post(LOGOUT, **auth_header(first))

    assert response.status_code == 204
    assert api.get("/api/me/", **auth_header(first)).status_code == 401
    assert api.get("/api/me/", **auth_header(second)).status_code == 200


def test_logout_without_a_token_is_a_401(api, db):
    assert api.post(LOGOUT).status_code == 401


def test_login_with_missing_fields_is_a_400(api, db):
    assert api.post(LOGIN, {}, format="json").status_code == 400
```

- [ ] **Step 2: Correr y ver que falla**

Run: `./.venv/bin/python -m pytest accounts/tests/test_login_logout.py -q`
Expected: FAIL; `/api/auth/login/` y `/api/auth/logout/` responden 404.

- [ ] **Step 3: Implementar**

En `backend/accounts/serializers.py`, agregar al final:

```python
class LoginSerializer(serializers.Serializer):
    email = EmailField(max_length=MAX_EMAIL_LENGTH)
    password = serializers.CharField(trim_whitespace=False, max_length=128)
```

En `backend/accounts/views.py`: cambiar el import de serializers a `from .serializers import LoginSerializer, RegisterSerializer, TokenSerializer`, agregar `from django.contrib.auth.hashers import check_password, make_password` arriba, y después de `ConfirmView`:

```python
# Checked when the email has no account, so "unknown email" takes as long as "wrong password".
_DUMMY_HASH = make_password("no-account")


class LoginView(PublicView):
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email, password = data.validated_data["email"], data.validated_data["password"]

        user = find_user(email)
        if user is None:
            check_password(password, _DUMMY_HASH)  # same cost as a real check; the result is irrelevant
            password_ok = False
        else:
            password_ok = user.check_password(password)
        if not password_ok:
            return Response({"detail": "Correo o contraseña incorrectos."}, status=status.HTTP_400_BAD_REQUEST)
        if not user.is_active:
            return Response(
                {"detail": "Confirmá tu correo antes de entrar.", "code": "email_not_confirmed"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response({"token": AuthToken.issue(user)})


class LogoutView(APIView):
    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

En `backend/accounts/urls.py`: importar `LoginView, LogoutView` y agregar:

```python
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
```

- [ ] **Step 4: Correr los tests y la suite**

Run: `./.venv/bin/python -m pytest accounts -q && ./.venv/bin/python -m pytest -q`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add backend/accounts
git commit -m "feat(backend): login and logout with session tokens

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Contrato para el front, verificación y pull request

**Files:**
- Create: `docs/contrato-api-cuentas.md`

**Interfaces:**
- Consumes: todos los endpoints de las Tareas 2 a 4.

- [ ] **Step 1: Escribir el contrato**

`docs/contrato-api-cuentas.md` debe incluir, en español: la tabla de los cinco endpoints (`register`, `confirm`, `login`, `logout`, `me`) con método, cuerpo, respuestas y códigos; el encabezado `Authorization: Bearer <token>`; que sin él la API sigue anónima por `X-Device-Id`; que un `401` con un token enviado significa "sesión inválida: limpiar y seguir como anónimo"; el formato del enlace del correo (`/cuenta/entrar#token=<token>&tipo=confirmar`); y una sección "Todavía no existe" con enlace por correo, recuperar contraseña, `/me/history/`, borrar cuenta y límites de envío (entregas 2 y 3).

- [ ] **Step 2: Verificación completa**

Run: `./.venv/bin/python -m pytest -q` y `./.venv/bin/python manage.py makemigrations --check --dry-run`
Expected: toda la suite verde y "No changes detected".

Prueba manual en desarrollo: `./.venv/bin/python manage.py runserver`, registrar un correo con `curl -X POST localhost:8000/api/auth/register/ -H 'Content-Type: application/json' -d '{"email":"prueba@example.com","password":"una-clave-larga-1"}'`, copiar el token del correo impreso en la consola del servidor, confirmarlo con `/api/auth/confirm/` y consultar `/api/me/` con el token devuelto.

- [ ] **Step 3: Commit, subir y abrir el pull request**

```bash
git add docs/contrato-api-cuentas.md
git commit -m "docs: accounts API contract for the frontend

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feat/backend-cuentas
gh pr create --base main --head feat/backend-cuentas --title "feat(backend): cuentas básicas (registro, confirmación, login, sesión por token)" --body "<qué agrega, qué queda para las entregas 2 a 4, pruebas>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

El pull request debe aclarar que **no cambia ninguna vista del juego** y que en producción no envía correo (backend `dummy`), por lo que es seguro mergearlo antes de tener proveedor de correo; y que agrega una migración (`accounts.0001`) que corre sola al desplegar.

---

## Auto-revisión

- **Cobertura de la spec (entrega 1):** modelos (§3) → Tarea 1; `register`, `confirm`, `login`, `logout`, `me` (§4) → Tareas 2 a 4; respuesta uniforme y contraseñas (§4) → Tareas 1, 3 y 4; correo de confirmación y "ya tenés cuenta" con token en el fragmento (§5) → Tarea 3; pruebas (§9) → todas. Quedan para las entregas siguientes, a propósito: enlace por correo, restablecer contraseña, límite de envíos y proveedor real (entrega 2), `user` en el juego, reclamo, historial y borrado (entrega 3), y todo el front (entrega 4).
- **Marcadores pendientes:** ninguno en las tareas de código. El texto del pull request y del contrato (Tarea 5) se redactan al final, con los resultados reales.
- **Consistencia de nombres:** `AuthToken.issue`, `EmailChallenge.issue/consume`, `hash_token`, `normalize_email`, `EmailField`, `BearerTokenAuthentication`, `send_confirmation`, `send_already_registered` y los fixtures `api`, `make_user`, `auth_header` se definen antes de usarse.
- **Review Focus:** los cinco puntos tienen su test (mayúsculas y espacios: Tareas 3 y 4; encabezado malformado: Tarea 2; correo largo: Tarea 3; carrera de registro: Tarea 3; contraseña de cuenta sin confirmar: Tarea 3).
- **Decisión para vigilar:** `login` devuelve `403` solo cuando la contraseña es correcta, así no revela si un correo existe a quien no la conoce.
