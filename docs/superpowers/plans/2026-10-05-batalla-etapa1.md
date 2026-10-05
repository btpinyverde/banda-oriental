# Batalla — etapa 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un grupo juegue una batalla: una persona crea una sala, los demás entran por link o QR, todos juegan las mismas canciones al azar con su propio audio y cada participante ve el ranking de esa batalla (y solo de las suyas) en "Mis batallas".

**Architecture:** App Django nueva `battles` con cuatro modelos y una máquina de estados **calculada al consultar** (el cronograma de rondas se fija al empezar; no hay procesos en segundo plano ni sockets). Los dispositivos consultan `GET /api/battles/<code>/` con una versión (`since`) y reportan sus respuestas por `POST`. El tiempo lo pone el servidor. Frontend Next.js: cliente de API, un hook de consulta con desfase de reloj, páginas `/batalla` y `/batalla/[code]`, y el selector "Diario | Mis batallas" en `/ranking`.

**Tech Stack:** Django 5.1 + DRF (pytest), Next.js 16 (Vitest + Testing Library), Deezer API (previews), librería `qrcode` para el QR.

**Spec:** `docs/superpowers/specs/2026-10-05-batalla-etapa1-design.md`

## Global Constraints

- Sin sockets: todo request/response. El servidor es la fuente de verdad del estado y del tiempo; nunca se usa el reloj del dispositivo para el puntaje.
- La canción correcta **nunca** se envía antes de `ends_at` de la ronda.
- Los resultados de una batalla solo los ve quien participó o la creó; para cualquier otra persona la respuesta es 404 "no encontrada" (misma que una sala inexistente).
- Los links de preview de Deezer caducan en ~15 min: nunca se guardan en la base; se piden frescos y se cachean menos de 10 min.
- Valores por defecto: 10 canciones, 20 segundos por ronda; límites: 3–30 rondas, 5–60 s, máximo 60 jugadores por sala.
- Textos de cara a la persona en español rioplatense (voseo). Comentarios de código en inglés, como el resto del backend.
- TDD: cada cambio de comportamiento empieza con la prueba fallando.
- Antes de operaciones git en el frontend: `rm -rf frontend/.next && git checkout -- frontend/next-env.d.ts frontend/tsconfig.tsbuildinfo`.
- El diseño visual es funcional; se pule después.

## Review Focus

1. Dos consultas simultáneas en el cambio de ronda no deben duplicar ni corromper el estado (el estado se calcula, no se muta; solo `PLAYING → FINISHED` se escribe, de forma idempotente).
2. Una respuesta que llega justo en `ends_at` o después se rechaza; una enviada dos veces cuenta una sola vez.
3. Una persona que no participó no puede ver ni deducir resultados (estado, `mine`, ranking) aunque conozca el código de la sala.
4. El organizador no puede jugar, y un jugador no puede empezar la batalla.
5. Un bar con 60 dispositivos detrás de la misma IP no debe chocar con el límite global de 240 pedidos/min.

---

## File Structure

Backend (nueva app `backend/battles/`):
- `models.py` — `Battle`, `BattleRound`, `BattlePlayer`, `BattleAnswer`.
- `identity.py` — quién llama (cuenta o dispositivo), `player_for`, `is_host`.
- `timeline.py` — funciones puras: cronograma de rondas y fase en un instante.
- `services.py` — crear, unirse, empezar, responder, ranking, "mis batallas".
- `previews.py` — preview fresco de Deezer con caché corta.
- `views.py`, `urls.py`, `serializers.py` — API.
- `tests/` — una prueba por responsabilidad.
Modificados: `config/settings/base.py`, `config/urls.py`, `core/throttling.py`, `catalog/deezer.py`, `accounts/claim.py`, `docs/contrato-api-batallas.md` (nuevo).

Frontend:
- `frontend/app/lib/batallas/api-batallas.ts` (+ test) — cliente de la API.
- `frontend/app/lib/batallas/useSala.ts` (+ test) — consulta periódica con desfase de reloj.
- `frontend/app/batalla/` — `page.tsx` (crear), `[code]/page.tsx`, `Sala.tsx`, `Lobby.tsx`, `Ronda.tsx`, `Resultados.tsx`, `batalla.css`.
- `frontend/app/ranking/MisBatallas.tsx` (+ test), cambios en `Ranking.tsx`.

---

## Task 1: App `battles` y modelos

**Files:**
- Create: `backend/battles/__init__.py`, `backend/battles/apps.py`, `backend/battles/models.py`, `backend/battles/tests/__init__.py`, `backend/battles/tests/test_models.py`
- Modify: `backend/config/settings/base.py` (INSTALLED_APPS y `BATTLES`), `backend/config/urls.py` (después, en Task 5)

**Interfaces:**
- Produces: `Battle(code, host_token, host_user, host_device_id, title, status, round_count, round_seconds, created_at, started_at, version)`, `BattleRound(battle, index, song, starts_at, ends_at)`, `BattlePlayer(battle, user, device_id, display_name, joined_at)`, `BattleAnswer(round, player, song_guessed, correct, received_at, points)`; `Battle.LOBBY/PLAYING/FINISHED`; `settings.BATTLES` (dict).

- [ ] **Step 1: Write the failing test** — `backend/battles/tests/test_models.py`

```python
import pytest
from django.db import IntegrityError, transaction

from battles.models import Battle, BattlePlayer

DEVICE = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def battle(db):
    return Battle.objects.create(round_count=5, round_seconds=20, host_device_id=DEVICE)


def test_battle_gets_a_readable_code_and_a_host_token(battle):
    assert len(battle.code) == 6
    assert battle.code == battle.code.upper()
    assert not set(battle.code) & set("ILO01")  # no look-alike characters
    assert len(battle.host_token) >= 24
    assert battle.status == Battle.LOBBY
    assert battle.version == 1


def test_codes_are_unique(db):
    codes = {Battle.objects.create(round_count=3, round_seconds=10, host_device_id=DEVICE).code for _ in range(30)}
    assert len(codes) == 30


def test_display_name_is_unique_in_a_battle_ignoring_case(battle):
    BattlePlayer.objects.create(battle=battle, device_id=DEVICE, display_name="Juan")
    with pytest.raises(IntegrityError), transaction.atomic():
        BattlePlayer.objects.create(battle=battle, device_id="22222222-2222-2222-2222-222222222222", display_name="juan")


def test_same_name_is_fine_in_another_battle(battle):
    other = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=DEVICE)
    BattlePlayer.objects.create(battle=battle, device_id=DEVICE, display_name="Juan")
    BattlePlayer.objects.create(battle=other, device_id=DEVICE, display_name="Juan")


def test_a_device_joins_a_battle_only_once(battle):
    BattlePlayer.objects.create(battle=battle, device_id=DEVICE, display_name="Juan")
    with pytest.raises(IntegrityError), transaction.atomic():
        BattlePlayer.objects.create(battle=battle, device_id=DEVICE, display_name="Otro")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/pytest battles/tests/test_models.py -q`
Expected: FAIL (`ModuleNotFoundError: battles`).

- [ ] **Step 3: Implement** — `backend/battles/apps.py`

```python
from django.apps import AppConfig


class BattlesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "battles"
```

`backend/battles/models.py`:

```python
import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

# Uppercase letters and digits without the look-alikes (I, L, O, 0, 1): the code is read aloud and typed on a phone.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_code():
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


def new_host_token():
    return secrets.token_urlsafe(24)


class Battle(models.Model):
    LOBBY, PLAYING, FINISHED = "lobby", "playing", "finished"
    STATUS_CHOICES = [(LOBBY, "En espera"), (PLAYING, "Jugando"), (FINISHED, "Terminada")]

    code = models.CharField(max_length=8, unique=True, default=new_code)
    # A capability: whoever holds it organizes the battle (kept on the host's device). Compared in constant time.
    host_token = models.CharField(max_length=64, default=new_host_token)
    host_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="hosted_battles")
    host_device_id = models.CharField(max_length=64, blank=True)
    title = models.CharField(max_length=60, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=LOBBY, db_index=True)
    round_count = models.PositiveSmallIntegerField()
    round_seconds = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    # Goes up with every change a polling device cares about (someone joins, answers, the battle starts or ends).
    version = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"Batalla {self.code}"


class BattleRound(models.Model):
    battle = models.ForeignKey(Battle, on_delete=models.CASCADE, related_name="rounds")
    index = models.PositiveSmallIntegerField()  # 0-based
    song = models.ForeignKey("catalog.Song", on_delete=models.PROTECT, related_name="+")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()

    class Meta:
        ordering = ["index"]
        constraints = [models.UniqueConstraint(fields=["battle", "index"], name="battle_round_index_unique")]


class BattlePlayer(models.Model):
    battle = models.ForeignKey(Battle, on_delete=models.CASCADE, related_name="players")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="battle_players")
    device_id = models.CharField(max_length=64, blank=True)
    display_name = models.CharField(max_length=50)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["joined_at", "id"]
        constraints = [
            models.UniqueConstraint(Lower("display_name"), "battle", name="battle_player_name_unique"),
            models.UniqueConstraint(fields=["battle", "user"], condition=Q(user__isnull=False), name="battle_player_user_unique"),
            models.UniqueConstraint(
                fields=["battle", "device_id"], condition=Q(user__isnull=True) & ~Q(device_id=""), name="battle_player_device_unique"
            ),
        ]


class BattleAnswer(models.Model):
    round = models.ForeignKey(BattleRound, on_delete=models.CASCADE, related_name="answers")
    player = models.ForeignKey(BattlePlayer, on_delete=models.CASCADE, related_name="answers")
    song_guessed = models.ForeignKey("catalog.Song", null=True, on_delete=models.SET_NULL, related_name="+")
    correct = models.BooleanField()
    received_at = models.DateTimeField()  # the server's clock, never the device's
    points = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["round", "player"], name="battle_answer_once")]
```

`backend/battles/__init__.py` y `backend/battles/tests/__init__.py`: vacíos. En `config/settings/base.py` agregar `"battles",` al final de `INSTALLED_APPS` y, junto a `GAMEPLAY_SPEED_BONUS`:

```python
BATTLES = {
    "MAX_PLAYERS": 60,
    "MIN_ROUNDS": 3,
    "MAX_ROUNDS": 30,
    "MIN_ROUND_SECONDS": 5,
    "MAX_ROUND_SECONDS": 60,
    "COUNTDOWN_SECONDS": 5,  # from "Empezar" to the first round
    "REVEAL_SECONDS": 6,  # between rounds: the answer and the partial ranking
    "BASE_POINTS": 100,
    "BONUS_MAX": 50,  # extra for answering fast, falling to 0 as the round runs out
}
```

- [ ] **Step 4: Migration and run**

Run: `cd backend && .venv/bin/python manage.py makemigrations battles && .venv/bin/pytest battles/tests/test_models.py -q`
Expected: migration `0001_initial` created; 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/battles backend/config/settings/base.py
git commit -m "feat: battles app with its four models"
```

---

## Task 2: Cronograma y fase (funciones puras)

**Files:**
- Create: `backend/battles/timeline.py`, `backend/battles/tests/test_timeline.py`

**Interfaces:**
- Produces: `build_schedule(start, round_count, round_seconds, countdown, reveal) -> list[tuple[datetime, datetime]]` (starts/ends por ronda); `phase_at(rounds, now, reveal) -> Phase` donde `Phase = namedtuple("Phase", "name index")` y `name ∈ {"countdown", "playing", "reveal", "finished"}` (`rounds` es la lista ordenada de `BattleRound`; `index` es el de la ronda a la que se refiere la fase).

El cronograma de la ronda `i`: empieza en `start + countdown + i*(round_seconds+reveal)`, termina `round_seconds` después; luego hay `reveal` segundos de pausa y arranca la siguiente.

- [ ] **Step 1: Write the failing test**

```python
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from battles.timeline import build_schedule, phase_at

T0 = datetime(2026, 10, 5, 20, 0, 0, tzinfo=timezone.utc)


def s(n):
    return T0 + timedelta(seconds=n)


def rounds_for(count=3, seconds=20, countdown=5, reveal=6):
    return [SimpleNamespace(index=i, starts_at=a, ends_at=b) for i, (a, b) in enumerate(build_schedule(T0, count, seconds, countdown, reveal))]


def test_schedule_leaves_a_countdown_and_a_reveal_between_rounds():
    assert build_schedule(T0, 3, 20, 5, 6) == [(s(5), s(25)), (s(31), s(51)), (s(57), s(77))]


def test_phases_along_the_battle():
    rounds = rounds_for()
    assert phase_at(rounds, s(0), 6) == ("countdown", 0)
    assert phase_at(rounds, s(4.9), 6) == ("countdown", 0)
    assert phase_at(rounds, s(5), 6) == ("playing", 0)
    assert phase_at(rounds, s(24.9), 6) == ("playing", 0)
    assert phase_at(rounds, s(25), 6) == ("reveal", 0)  # the round closes exactly at ends_at
    assert phase_at(rounds, s(30.9), 6) == ("reveal", 0)
    assert phase_at(rounds, s(31), 6) == ("playing", 1)
    assert phase_at(rounds, s(76.9), 6) == ("playing", 2)
    assert phase_at(rounds, s(77), 6) == ("reveal", 2)
    assert phase_at(rounds, s(83), 6) == ("finished", 2)
    assert phase_at(rounds, s(9999), 6) == ("finished", 2)
```

- [ ] **Step 2: Run** — `cd backend && .venv/bin/pytest battles/tests/test_timeline.py -q` — Expected: FAIL (import error).

- [ ] **Step 3: Implement** — `backend/battles/timeline.py`

```python
from collections import namedtuple
from datetime import timedelta

Phase = namedtuple("Phase", "name index")


def build_schedule(start, round_count, round_seconds, countdown, reveal):
    """(starts_at, ends_at) of every round, fixed when the battle starts: nothing has to run in the background, because
    the phase at any moment is computed from these times."""
    first = start + timedelta(seconds=countdown)
    step = timedelta(seconds=round_seconds + reveal)
    return [(first + i * step, first + i * step + timedelta(seconds=round_seconds)) for i in range(round_count)]


def phase_at(rounds, now, reveal):
    if now < rounds[0].starts_at:
        return Phase("countdown", 0)
    for r in rounds:
        if now < r.ends_at:
            return Phase("playing", r.index)
        if now < r.ends_at + timedelta(seconds=reveal):
            return Phase("reveal", r.index)
    return Phase("finished", rounds[-1].index)
```

- [ ] **Step 4: Run** — Expected: 2 passed.

- [ ] **Step 5: Commit** — `git add backend/battles && git commit -m "feat: battle timeline as pure functions"`

---

## Task 3: Preview de Deezer

**Files:**
- Modify: `backend/catalog/deezer.py` (agregar `get_track_preview`)
- Create: `backend/battles/previews.py`, `backend/battles/tests/test_previews.py`

**Interfaces:**
- Produces: `catalog.deezer.get_track_preview(track_id) -> str | None` (URL o `None` si no tiene); `battles.previews.preview_url(song) -> str | None` con caché de 540 s por `deezer_id`.

- [ ] **Step 1: Write the failing test**

```python
import pytest
from django.core.cache import cache

from battles import previews
from catalog.models import Album, Artist, Song


@pytest.fixture
def song(db):
    artist = Artist.objects.create(mbid="a1", name="Jorge Drexler")
    album = Album.objects.create(mbid="al1", name="Eco", artist=artist, year=2004)
    return Song.objects.create(mbid="s1", title="Al otro lado del río", album=album, deezer_id=777)


def test_asks_deezer_once_and_caches_the_url(song, monkeypatch):
    calls = []
    monkeypatch.setattr(previews.deezer, "get_track_preview", lambda track_id: calls.append(track_id) or "https://cdn/x.mp3")
    assert previews.preview_url(song) == "https://cdn/x.mp3"
    assert previews.preview_url(song) == "https://cdn/x.mp3"
    assert calls == [777]


def test_song_without_deezer_id_has_no_preview(song, monkeypatch):
    song.deezer_id = None
    monkeypatch.setattr(previews.deezer, "get_track_preview", lambda track_id: pytest.fail("must not ask"))
    assert previews.preview_url(song) is None


def test_deezer_failure_gives_none_and_is_not_cached(song, monkeypatch):
    def boom(track_id):
        raise previews.deezer.DeezerError("down")

    monkeypatch.setattr(previews.deezer, "get_track_preview", boom)
    assert previews.preview_url(song) is None
    monkeypatch.setattr(previews.deezer, "get_track_preview", lambda track_id: "https://cdn/y.mp3")
    assert previews.preview_url(song) == "https://cdn/y.mp3"
```

- [ ] **Step 2: Run** — `.venv/bin/pytest battles/tests/test_previews.py -q` — Expected: FAIL.

- [ ] **Step 3: Implement** — agregar al final de `catalog/deezer.py`:

```python
def get_track_preview(track_id):
    """The 30-second preview URL of a track, or None if Deezer has none. The URL is signed and expires in about
    15 minutes, so it must never be stored."""
    raw = _get(f"/track/{track_id}")
    return raw.get("preview") or None
```

`backend/battles/previews.py`:

```python
from django.core.cache import cache

from catalog import deezer

# Shorter than the ~15 minutes a Deezer link lives, so a cached URL is always still valid when served.
TTL_SECONDS = 540


def preview_url(song):
    """A fresh preview URL for the song, or None (no Deezer id, no preview, or Deezer failing). Only successes are cached."""
    if not song.deezer_id:
        return None
    key = f"battle-preview:{song.deezer_id}"
    url = cache.get(key)
    if url:
        return url
    try:
        url = deezer.get_track_preview(song.deezer_id)
    except deezer.DeezerError:
        return None
    if url:
        cache.set(key, url, TTL_SECONDS)
    return url
```

- [ ] **Step 4: Run** — Expected: 3 passed. Also `.venv/bin/pytest catalog -q` stays green.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat: fresh Deezer preview for a song, cached briefly"`

---

## Task 4: Identidad (quién llama)

**Files:**
- Create: `backend/battles/identity.py`, `backend/battles/tests/test_identity.py`

**Interfaces:**
- Produces: `Caller(user, device_id)` namedtuple; `get_caller(request) -> Caller` (usa `gameplay.views.get_device_id`); `player_for(battle, caller) -> BattlePlayer | None`; `is_host(battle, caller, token) -> bool`; `is_member(battle, caller, token) -> bool`.

Reglas: con sesión la identidad es la cuenta; sin sesión es el dispositivo (solo filas sin cuenta). `is_host` es verdadero si el token coincide (comparación en tiempo constante) o si el llamador es el `host_user` / el `host_device_id` (este último solo si no tiene sesión y la batalla no tiene `host_user`).

- [ ] **Step 1: Write the failing test**

```python
import pytest
from django.contrib.auth import get_user_model

from battles.identity import Caller, is_host, is_member, player_for
from battles.models import Battle, BattlePlayer

D1 = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def battle(db):
    return Battle.objects.create(round_count=3, round_seconds=10, host_device_id=D1)


def test_anonymous_player_is_found_by_device(battle):
    p = BattlePlayer.objects.create(battle=battle, device_id=D2, display_name="Ana")
    assert player_for(battle, Caller(None, D2)) == p
    assert player_for(battle, Caller(None, D1)) is None


def test_signed_in_player_is_found_by_account_and_not_by_device_alone(battle, django_user_model):
    user = django_user_model.objects.create_user(username="u", email="u@x.uy", password="x" * 12)
    p = BattlePlayer.objects.create(battle=battle, user=user, device_id=D2, display_name="Ana")
    assert player_for(battle, Caller(user, "33333333-3333-3333-3333-333333333333")) == p
    # a stranger on the same device without the session must not become the account's player
    assert player_for(battle, Caller(None, D2)) is None


def test_host_by_token_or_by_device(battle):
    assert is_host(battle, Caller(None, D2), battle.host_token)
    assert is_host(battle, Caller(None, D1), "")
    assert not is_host(battle, Caller(None, D2), "wrong-token")
    assert not is_host(battle, Caller(None, D2), "")


def test_membership_is_host_or_player(battle):
    BattlePlayer.objects.create(battle=battle, device_id=D2, display_name="Ana")
    assert is_member(battle, Caller(None, D2), "")
    assert is_member(battle, Caller(None, D1), "")
    assert not is_member(battle, Caller(None, "44444444-4444-4444-4444-444444444444"), "")
```

- [ ] **Step 2: Run** — Expected: FAIL (import).

- [ ] **Step 3: Implement** — `backend/battles/identity.py`

```python
import secrets
from collections import namedtuple

from gameplay.ownership import is_signed_in
from gameplay.views import get_device_id

from .models import BattlePlayer

Caller = namedtuple("Caller", "user device_id")


def get_caller(request):
    return Caller(request.user if is_signed_in(request) else None, get_device_id(request))


def player_for(battle, caller):
    """The caller's player in this battle: by account with a session, by device (rows nobody owns) without one."""
    if caller.user is not None:
        return battle.players.filter(user=caller.user).first()
    return battle.players.filter(device_id=caller.device_id, user__isnull=True).first()


def is_host(battle, caller, token):
    if token and secrets.compare_digest(token, battle.host_token):
        return True
    if caller.user is not None:
        return battle.host_user_id == caller.user.pk
    return battle.host_user_id is None and bool(battle.host_device_id) and battle.host_device_id == caller.device_id


def is_member(battle, caller, token):
    return is_host(battle, caller, token) or player_for(battle, caller) is not None
```

(El import de `BattlePlayer` no se usa: quitarlo si el linter lo pide.)

- [ ] **Step 4: Run** — Expected: 4 passed.

- [ ] **Step 5: Commit** — `git add backend/battles && git commit -m "feat: who is calling a battle: account or device, host by token"`

---

## Task 5: Crear una batalla (servicio + API)

**Files:**
- Create: `backend/battles/services.py`, `backend/battles/views.py`, `backend/battles/urls.py`, `backend/battles/tests/test_create.py`
- Modify: `backend/config/urls.py`, `backend/config/settings/base.py` (throttles), `backend/core/throttling.py` (eximir de lo global), `backend/core/tests/test_abuse.py` (prueba de la exención)

**Interfaces:**
- Produces: `services.create_battle(caller, round_count, round_seconds, title) -> Battle`; `POST /api/battles/` → `201 {"code", "host_token", "round_count", "round_seconds", "title"}`; URL names `battles:create`, `battles:detail` (lo define Task 8), etc.; throttle scopes `battle-create` (`20/hour`), `battle-join` (`120/hour`), `battle-answer` (`240/min`), `battle-state` (`3000/min`); `IpThrottle` omite las vistas con `skip_global_throttle = True`.

- [ ] **Step 1: Write the failing tests** — `backend/battles/tests/test_create.py`

```python
import pytest
from django.urls import reverse

from battles.models import Battle

D1 = "11111111-1111-1111-1111-111111111111"


def create(client, **body):
    return client.post(reverse("battles:create"), data=body, content_type="application/json", HTTP_X_DEVICE_ID=D1)


def test_creates_a_battle_with_defaults(client, db):
    r = create(client)
    assert r.status_code == 201
    data = r.json()
    battle = Battle.objects.get(code=data["code"])
    assert (battle.round_count, battle.round_seconds) == (10, 20)
    assert battle.status == Battle.LOBBY
    assert battle.host_device_id == D1
    assert data["host_token"] == battle.host_token


def test_takes_rounds_seconds_and_title(client, db):
    r = create(client, round_count=5, round_seconds=15, title="Cumple de Ana")
    assert r.status_code == 201
    b = Battle.objects.get(code=r.json()["code"])
    assert (b.round_count, b.round_seconds, b.title) == (5, 15, "Cumple de Ana")


@pytest.mark.parametrize("body", [{"round_count": 2}, {"round_count": 31}, {"round_seconds": 4}, {"round_seconds": 61}, {"round_count": "x"}, {"title": 5}])
def test_rejects_out_of_range_or_wrong_types(client, db, body):
    assert create(client, **body).status_code == 400


def test_rejects_a_banned_title(client, db, monkeypatch):
    monkeypatch.setattr("battles.services.contains_banned_word", lambda text: True)
    assert create(client, title="x").status_code == 400


def test_needs_a_device_id(client, db):
    assert client.post(reverse("battles:create"), data={}, content_type="application/json").status_code == 400
```

Y en `backend/core/tests/test_abuse.py` (ajustar al estilo del archivo) una prueba de que una vista con `skip_global_throttle = True` no consume el límite global:

```python
def test_a_view_can_opt_out_of_the_global_limit(settings, rf):
    from core.throttling import IpThrottle

    class V:
        skip_global_throttle = True

    assert IpThrottle().allow_request(rf.get("/"), V()) is True
```

- [ ] **Step 2: Run** — Expected: FAIL (no `battles:create`, no `skip_global_throttle`).

- [ ] **Step 3: Implement**

`backend/core/throttling.py`, en `IpThrottle`:

```python
    def allow_request(self, request, view):
        # Views that carry their own, higher limit (the Battle's polling: a bar's phones share one address) opt out.
        if getattr(view, "skip_global_throttle", False):
            return True
        return super().allow_request(request, view)
```

`config/settings/base.py`, en `DEFAULT_THROTTLE_RATES`: agregar `"battle-create": "20/hour", "battle-join": "120/hour", "battle-answer": "240/min", "battle-state": "3000/min",`.

`backend/battles/services.py`:

```python
from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from gameplay.moderation import contains_banned_word

from .models import Battle


def _int_in_range(value, default, low, high, field):
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError({field: "Tiene que ser un número."})
    if not low <= value <= high:
        raise ValidationError({field: f"Tiene que estar entre {low} y {high}."})
    return value


def create_battle(caller, round_count=None, round_seconds=None, title=None):
    cfg = settings.BATTLES
    round_count = _int_in_range(round_count, 10, cfg["MIN_ROUNDS"], cfg["MAX_ROUNDS"], "round_count")
    round_seconds = _int_in_range(round_seconds, 20, cfg["MIN_ROUND_SECONDS"], cfg["MAX_ROUND_SECONDS"], "round_seconds")
    if title is None:
        title = ""
    if not isinstance(title, str):
        raise ValidationError({"title": "Tiene que ser texto."})
    title = title.strip()
    if len(title) > 60 or contains_banned_word(title):
        raise ValidationError({"title": "Título inválido."})
    for _ in range(5):  # a code collision is possible, if rare: try again with another
        try:
            with transaction.atomic():
                return Battle.objects.create(
                    host_user=caller.user,
                    host_device_id=caller.device_id if caller.user is None else "",
                    round_count=round_count,
                    round_seconds=round_seconds,
                    title=title,
                )
        except IntegrityError:
            continue
    raise ValidationError({"detail": "No pudimos crear la sala. Probá de nuevo."})
```

`backend/battles/views.py`:

```python
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import BearerTokenAuthentication
from core.human import HasHumanPass

from . import services
from .identity import get_caller


class CreateView(APIView):
    throttle_scope = "battle-create"
    permission_classes = [HasHumanPass]
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request):
        caller = get_caller(request)
        battle = services.create_battle(
            caller,
            round_count=request.data.get("round_count"),
            round_seconds=request.data.get("round_seconds"),
            title=request.data.get("title"),
        )
        return Response(
            {"code": battle.code, "host_token": battle.host_token, "round_count": battle.round_count, "round_seconds": battle.round_seconds, "title": battle.title},
            status=201,
        )
```

`backend/battles/urls.py`:

```python
from django.urls import path

from .views import CreateView

app_name = "battles"

urlpatterns = [
    path("battles/", CreateView.as_view(), name="create"),
]
```

`config/urls.py`: agregar `path("api/", include("battles.urls")),`.

- [ ] **Step 4: Run** — `.venv/bin/pytest battles core -q` — Expected: all pass.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat: create a battle, with its own rates and the polling exempt from the global limit"`

---

## Task 6: Unirse a una batalla

**Files:**
- Modify: `backend/battles/services.py`, `backend/battles/views.py`, `backend/battles/urls.py`
- Create: `backend/battles/tests/test_join.py`

**Interfaces:**
- Produces: `services.join_battle(battle, caller, display_name) -> BattlePlayer`; `POST /api/battles/<code>/join/` body `{"display_name"}` → `201 {"player": {"name"}}`; `battles:join`.

Reglas: la sala debe estar en `lobby` (si no, 404, igual que si no existiera); el organizador no puede unirse (400); máximo `MAX_PLAYERS` (400 "La sala está llena."); nombre 1–50 caracteres sin caracteres de control ni palabras prohibidas; nombre único sin distinguir mayúsculas en la sala (400 "Ese nombre ya está en la sala. Elegí otro."); si la persona ya es jugadora, entrar de nuevo devuelve su jugador (idempotente, 200) sin cambiar el nombre. Cada alta sube `Battle.version`.

- [ ] **Step 1: Write the failing tests** — `backend/battles/tests/test_join.py`

```python
import pytest
from django.urls import reverse

from battles.models import Battle, BattlePlayer

HOST = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"
D3 = "33333333-3333-3333-3333-333333333333"


@pytest.fixture
def battle(db):
    return Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)


def join(client, battle, name="Ana", device=D2, code=None):
    return client.post(
        reverse("battles:join", args=[code or battle.code]), data={"display_name": name}, content_type="application/json", HTTP_X_DEVICE_ID=device
    )


def test_a_player_joins_and_the_version_goes_up(client, battle):
    r = join(client, battle)
    assert r.status_code == 201
    assert r.json()["player"]["name"] == "Ana"
    battle.refresh_from_db()
    assert battle.version == 2 and battle.players.count() == 1


def test_joining_again_is_idempotent_and_keeps_the_name(client, battle):
    join(client, battle, "Ana")
    r = join(client, battle, "Otro nombre")
    assert r.status_code == 200 and r.json()["player"]["name"] == "Ana"
    assert battle.players.count() == 1


def test_the_name_is_unique_in_the_battle_ignoring_case(client, battle):
    join(client, battle, "Ana")
    r = join(client, battle, "ana", device=D3)
    assert r.status_code == 400 and "Elegí otro" in str(r.json())


@pytest.mark.parametrize("name", ["", "   ", "x" * 51, "a\x00b", 5, None])
def test_invalid_names_are_rejected(client, battle, name):
    assert join(client, battle, name).status_code == 400


def test_banned_words_are_rejected(client, battle, monkeypatch):
    monkeypatch.setattr("battles.services.contains_banned_word", lambda t: True)
    assert join(client, battle).status_code == 400


def test_the_host_cannot_join_his_own_battle(client, battle):
    assert join(client, battle, device=HOST).status_code == 400


def test_unknown_or_started_battle_is_not_found(client, battle):
    assert join(client, battle, code="ZZZZZZ").status_code == 404
    battle.status = Battle.PLAYING
    battle.save()
    assert join(client, battle).status_code == 404


def test_full_battle_is_refused(client, battle, settings):
    settings.BATTLES = {**settings.BATTLES, "MAX_PLAYERS": 1}
    join(client, battle, "Ana")
    r = join(client, battle, "Beto", device=D3)
    assert r.status_code == 400 and "llena" in str(r.json())
```

- [ ] **Step 2: Run** — Expected: FAIL (no `battles:join`).

- [ ] **Step 3: Implement** — agregar a `services.py`:

```python
import re

from django.db.models import F

from .identity import is_host, player_for
from .models import BattlePlayer

NAME_TAKEN = "Ese nombre ya está en la sala. Elegí otro."
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def _clean_name(name):
    if not isinstance(name, str):
        raise ValidationError({"display_name": "Tiene que ser texto."})
    name = name.strip()
    if not name or len(name) > 50 or _CONTROL.search(name) or contains_banned_word(name):
        raise ValidationError({"display_name": "Nombre inválido."})
    return name


def join_battle(battle, caller, display_name, host_token=""):
    """Adds the caller to the battle in its lobby. Returns (player, created)."""
    existing = player_for(battle, caller)
    if existing is not None:
        return existing, False
    if is_host(battle, caller, host_token):
        raise ValidationError({"detail": "Quien organiza la batalla no juega."})
    name = _clean_name(display_name)
    if battle.players.count() >= settings.BATTLES["MAX_PLAYERS"]:
        raise ValidationError({"detail": "La sala está llena."})
    try:
        with transaction.atomic():
            player = BattlePlayer.objects.create(
                battle=battle, user=caller.user, device_id=caller.device_id if caller.user is None else "", display_name=name
            )
    except IntegrityError:
        raise ValidationError({"display_name": NAME_TAKEN})
    Battle.objects.filter(pk=battle.pk).update(version=F("version") + 1)
    return player, True
```

(Mover los imports al principio del archivo.) En `views.py`:

```python
from django.http import Http404
from django.shortcuts import get_object_or_404

from .models import Battle


def lobby_battle_or_404(code):
    # A battle that is not in its lobby (or does not exist) is "not found": the code only serves to join.
    return get_object_or_404(Battle, code=code.upper(), status=Battle.LOBBY)


class JoinView(APIView):
    throttle_scope = "battle-join"
    permission_classes = [HasHumanPass]
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request, code):
        caller = get_caller(request)
        battle = lobby_battle_or_404(code)
        player, created = services.join_battle(
            battle, caller, request.data.get("display_name"), request.headers.get("X-Host-Token", "")
        )
        return Response({"player": {"name": player.display_name}}, status=201 if created else 200)
```

`urls.py`: `path("battles/<str:code>/join/", JoinView.as_view(), name="join"),`. (`Http404` no se usa: quitar el import.)

- [ ] **Step 4: Run** — `.venv/bin/pytest battles -q` — Expected: all pass.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat: join a battle with a name that is unique in the room"`

---

## Task 7: Empezar la batalla

**Files:**
- Modify: `backend/battles/services.py`, `backend/battles/views.py`, `backend/battles/urls.py`
- Create: `backend/battles/tests/test_start.py`

**Interfaces:**
- Produces: `services.start_battle(battle, now=None)`; `POST /api/battles/<code>/start/` (solo el organizador; cabecera `X-Host-Token` o identidad de organizador) → `200 {"status": "playing"}`; `battles:start`.

Reglas: debe haber al menos 2 jugadores (si no, 400 "Hace falta al menos otra persona para jugar."); solo en `lobby`; solo el organizador (si no, 404 para no organizadores, como cualquier no miembro; 403 no, para no revelar la sala). Sorteo: canciones **no ocultas con `deezer_id`**, distintas, y se queda con las que **tienen preview** (se consulta `preview_url` y se salta la que falla, hasta `3 * round_count` intentos); si no alcanza, 400 "No pudimos armar las canciones. Probá de nuevo." sin cambiar el estado. Crea las rondas con `build_schedule(now, ...)`, pasa a `playing`, fija `started_at`, sube `version`.

- [ ] **Step 1: Write the failing tests** — `backend/battles/tests/test_start.py`

```python
from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from battles.models import Battle, BattlePlayer
from catalog.models import Album, Artist, Song

HOST = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"
D3 = "33333333-3333-3333-3333-333333333333"


@pytest.fixture
def songs(db):
    artist = Artist.objects.create(mbid="a", name="Artista")
    album = Album.objects.create(mbid="al", name="Disco", artist=artist, year=2000)
    return [Song.objects.create(mbid=f"s{i}", title=f"Tema {i}", album=album, deezer_id=1000 + i) for i in range(12)]


@pytest.fixture
def battle(db):
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    BattlePlayer.objects.create(battle=b, device_id=D3, display_name="Beto")
    return b


@pytest.fixture(autouse=True)
def previews(monkeypatch):
    monkeypatch.setattr("battles.services.preview_url", lambda song: f"https://cdn/{song.deezer_id}.mp3")


def start(client, battle, device=HOST, token=""):
    return client.post(reverse("battles:start", args=[battle.code]), data={}, content_type="application/json", HTTP_X_DEVICE_ID=device, HTTP_X_HOST_TOKEN=token)


def test_start_creates_the_rounds_and_the_schedule(client, battle, songs):
    r = start(client, battle)
    assert r.status_code == 200
    battle.refresh_from_db()
    assert battle.status == Battle.PLAYING and battle.started_at is not None
    rounds = list(battle.rounds.all())
    assert [x.index for x in rounds] == [0, 1, 2]
    assert len({x.song_id for x in rounds}) == 3
    assert rounds[0].starts_at == battle.started_at + timedelta(seconds=5)
    assert rounds[1].starts_at == rounds[0].ends_at + timedelta(seconds=6)


def test_only_the_host_can_start_and_others_get_not_found(client, battle, songs):
    assert start(client, battle, device=D2).status_code == 404
    assert start(client, battle, device="44444444-4444-4444-4444-444444444444").status_code == 404
    assert start(client, battle, device=D3, token=battle.host_token).status_code == 200  # the token is enough


def test_needs_at_least_two_players(client, songs, db):
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    r = start(client, b)
    assert r.status_code == 400 and "al menos otra persona" in str(r.json())


def test_skips_songs_without_preview_and_hidden_ones(client, battle, songs, monkeypatch):
    songs[0].hidden = True
    songs[0].save()
    monkeypatch.setattr("battles.services.preview_url", lambda song: None if song.deezer_id % 2 else f"https://cdn/{song.deezer_id}.mp3")
    assert start(client, battle).status_code == 200
    for x in battle.rounds.all():
        assert x.song.deezer_id % 2 == 0 and not x.song.hidden


def test_fails_cleanly_when_not_enough_songs_have_preview(client, battle, songs, monkeypatch):
    monkeypatch.setattr("battles.services.preview_url", lambda song: None)
    r = start(client, battle)
    assert r.status_code == 400
    battle.refresh_from_db()
    assert battle.status == Battle.LOBBY and battle.rounds.count() == 0


def test_cannot_start_twice(client, battle, songs):
    start(client, battle)
    assert start(client, battle).status_code == 404  # no longer in its lobby
```

- [ ] **Step 2: Run** — Expected: FAIL (no `battles:start`).

- [ ] **Step 3: Implement** — en `services.py`:

```python
from django.utils import timezone

from catalog.models import Song

from .models import BattleRound
from .previews import preview_url
from .timeline import build_schedule


def _pick_songs(count):
    """`count` distinct songs that have a Deezer preview, at random; hidden ones (duplicates, classical) never play."""
    ids = list(Song.objects.filter(hidden=False, deezer_id__isnull=False).order_by("?").values_list("pk", flat=True)[: count * 6])
    chosen = []
    for song in Song.objects.filter(pk__in=ids).order_by("?").select_related("album__artist")[: count * 3]:
        if preview_url(song):
            chosen.append(song)
        if len(chosen) == count:
            return chosen
    raise ValidationError({"detail": "No pudimos armar las canciones. Probá de nuevo."})


def start_battle(battle, now=None):
    now = now or timezone.now()
    if battle.players.count() < 2:
        raise ValidationError({"detail": "Hace falta al menos otra persona para jugar."})
    songs = _pick_songs(battle.round_count)
    cfg = settings.BATTLES
    schedule = build_schedule(now, battle.round_count, battle.round_seconds, cfg["COUNTDOWN_SECONDS"], cfg["REVEAL_SECONDS"])
    with transaction.atomic():
        # Only one request wins the move out of the lobby; any other finds it already started.
        moved = Battle.objects.filter(pk=battle.pk, status=Battle.LOBBY).update(status=Battle.PLAYING, started_at=now, version=F("version") + 1)
        if not moved:
            raise ValidationError({"detail": "La batalla ya empezó."})
        BattleRound.objects.bulk_create(
            [BattleRound(battle=battle, index=i, song=song, starts_at=a, ends_at=b) for i, (song, (a, b)) in enumerate(zip(songs, schedule))]
        )
```

`views.py`:

```python
from .identity import is_host


class StartView(APIView):
    throttle_scope = "battle-join"
    permission_classes = [HasHumanPass]
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request, code):
        caller = get_caller(request)
        battle = lobby_battle_or_404(code)
        if not is_host(battle, caller, request.headers.get("X-Host-Token", "")):
            raise Http404
        services.start_battle(battle)
        return Response({"status": Battle.PLAYING})
```

(importar `Http404` de `django.http`). `urls.py`: `path("battles/<str:code>/start/", StartView.as_view(), name="start"),`.

- [ ] **Step 4: Run** — `.venv/bin/pytest battles -q` — Expected: all pass.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat: start a battle: random songs with preview and a fixed schedule"`

---

## Task 8: Estado de la sala (consulta periódica)

**Files:**
- Create: `backend/battles/state.py`, `backend/battles/tests/test_state.py`
- Modify: `backend/battles/views.py`, `backend/battles/urls.py`

**Interfaces:**
- Consumes: `phase_at`, `preview_url`, `is_host`, `player_for`.
- Produces: `GET /api/battles/<code>/` (`battles:detail`), con `?since=<key>`. Vista con `skip_global_throttle = True`, `throttle_scope = "battle-state"`.

Respuesta para miembros (jugador u organizador):

```json
{
  "server_time": "ISO",
  "key": "<version>.<fase><indice>",
  "changed": true,
  "code": "ABC123", "title": "", "role": "host|player",
  "status": "lobby|playing|finished",
  "round_count": 10, "round_seconds": 20,
  "players": [{"name": "Ana", "answered": false}],
  "phase": {"name": "countdown|playing|reveal|finished", "index": 0},
  "round": {"index": 0, "starts_at": "ISO", "ends_at": "ISO", "preview_url": "...", "answered": false},
  "reveal": {"song": {"title","artist","album","year"}, "my_answer": {"correct": true, "points": 130, "guessed": "Título"} | null},
  "ranking": [{"position":1,"name":"Ana","points":130,"correct":1}]
}
```

- `answered` por jugador **solo** lo ve el organizador; un jugador solo recibe el suyo en `round.answered`.
- `round` solo cuando `status == playing`: en `countdown`/`playing` es la ronda actual; en `reveal` es la **siguiente** (para precargar el audio; si es la última, `null`). `preview_url` solo para jugadores (nunca el organizador).
- `reveal` y `ranking` solo en fase `reveal` y `finished`; la canción se envía **solo si ahora ≥ `ends_at`**.
- En `lobby`, miembros ven `players`; no hay `round`.
- Si `since == key` → `{"changed": false, "server_time": "..."}` (después de verificar la membresía).
- No miembro: si la batalla está en `lobby` → `{"joinable": true, "code", "title", "round_count", "round_seconds", "players_count"}`; en otro caso 404.
- Al detectar fase `finished` con la batalla en `playing`, se hace `UPDATE ... SET status='finished', version=version+1 WHERE status='playing'` (idempotente).
- Las rondas se cachean por batalla una vez empezada (`cache` 1 h) para no consultarlas en cada pedido.

- [ ] **Step 1: Write the failing tests** — `backend/battles/tests/test_state.py` (cubre: lobby para miembro y no miembro; la canción no aparece antes de `ends_at`; `reveal` muestra la canción y el ranking; el organizador no recibe `preview_url`; `answered` solo para el organizador; `since` igual a `key` → `changed: false`; pasa a `finished` y la batalla queda `finished` en la base; no miembro de una batalla en juego → 404; 404 para código inexistente). Usar un `freeze` simple: monkeypatchear `battles.state.timezone.now` con una función que devuelva el instante de la prueba, y crear la batalla con `start_battle(battle, now=T0)` (con `previews` mockeado como en Task 7).

```python
from datetime import datetime, timedelta, timezone as tz

import pytest
from django.urls import reverse

from battles import services, state
from battles.models import Battle, BattlePlayer
from catalog.models import Album, Artist, Song

HOST = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"
D3 = "33333333-3333-3333-3333-333333333333"
STRANGER = "44444444-4444-4444-4444-444444444444"
T0 = datetime(2026, 10, 5, 20, 0, 0, tzinfo=tz.utc)


def at(seconds):
    return T0 + timedelta(seconds=seconds)


@pytest.fixture
def running(db, monkeypatch):
    artist = Artist.objects.create(mbid="a", name="Artista")
    album = Album.objects.create(mbid="al", name="Disco", artist=artist, year=2000)
    for i in range(10):
        Song.objects.create(mbid=f"s{i}", title=f"Tema {i}", album=album, deezer_id=1000 + i)
    monkeypatch.setattr("battles.services.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    monkeypatch.setattr("battles.state.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    b = Battle.objects.create(round_count=2, round_seconds=10, host_device_id=HOST)
    BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    BattlePlayer.objects.create(battle=b, device_id=D3, display_name="Beto")
    services.start_battle(b, now=T0)
    return b


def get(client, battle, device, now, since=None):
    import battles.state as st

    st.timezone.now = lambda: now  # the module's clock for this request
    url = reverse("battles:detail", args=[battle.code]) + (f"?since={since}" if since else "")
    return client.get(url, HTTP_X_DEVICE_ID=device)


def test_the_correct_song_is_not_sent_before_the_round_ends(client, running):
    r = get(client, running, D2, at(10)).json()  # round 0 is playing: 5..15
    assert r["phase"] == {"name": "playing", "index": 0}
    assert "reveal" not in r and r["round"]["preview_url"].startswith("https://cdn/")


def test_reveal_shows_the_song_and_the_ranking(client, running):
    r = get(client, running, D2, at(16)).json()
    assert r["phase"]["name"] == "reveal"
    assert r["reveal"]["song"]["title"].startswith("Tema")
    assert [p["name"] for p in r["ranking"]] == ["Ana", "Beto"]
    assert r["round"]["index"] == 1  # the next round, so the device can preload its audio


def test_host_gets_no_preview_and_sees_who_answered(client, running):
    r = get(client, running, HOST, at(10)).json()
    assert r["role"] == "host" and "preview_url" not in (r["round"] or {})
    assert all("answered" in p for p in r["players"])
    assert all("answered" not in p for p in get(client, running, D2, at(10)).json()["players"])


def test_since_equal_to_key_says_nothing_changed(client, running):
    key = get(client, running, D2, at(10)).json()["key"]
    assert get(client, running, D2, at(10), since=key).json()["changed"] is False
    assert get(client, running, D2, at(16), since=key).json()["changed"] is True  # the phase moved on


def test_strangers_get_not_found_once_it_started(client, running):
    assert get(client, running, STRANGER, at(10)).status_code == 404
    assert get(client, running, STRANGER, at(10)).status_code == get(client, Battle(code="ZZZZZZ"), STRANGER, at(10)).status_code


def test_the_battle_is_marked_finished_when_the_time_is_over(client, running):
    r = get(client, running, D2, at(500)).json()
    assert r["phase"]["name"] == "finished" and r["status"] == "finished" or r["status"] == "finished"
    running.refresh_from_db()
    assert running.status == Battle.FINISHED


def test_a_stranger_can_see_the_lobby_basics_only(client, db):
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST, title="Cumple")
    r = get(client, b, STRANGER, at(0)).json()
    assert r == {"joinable": True, "code": b.code, "title": "Cumple", "round_count": 3, "round_seconds": 10, "players_count": 0}
```

(Nota para el implementador: `get()` reemplaza `state.timezone.now` globalmente en la prueba; usar `monkeypatch.setattr` en un fixture si se prefiere, manteniendo la intención.)

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** — `backend/battles/state.py` con `build_state(battle, caller, token, since)` que: carga las rondas con caché; calcula `phase_at`; arma `key = f"{battle.version}.{phase.name}{phase.index}"` (en `lobby`: `f"{battle.version}.lobby"`); corta con `{"changed": False, ...}` si `since == key`; arma el payload de arriba; marca `finished` de forma idempotente y reconstruye `key` si cambió. Usa `from django.utils import timezone` (la prueba lo parchea) y `from .previews import preview_url`. Ranking: `services.ranking(battle)` (Task 9). El payload de `reveal.song` usa `song_payload` de `gameplay.views`.

`views.py`:

```python
class DetailView(APIView):
    throttle_scope = "battle-state"
    skip_global_throttle = True
    authentication_classes = [BearerTokenAuthentication]

    def get(self, request, code):
        caller = get_caller(request)
        battle = get_object_or_404(Battle, code=code.upper())
        data = state.build_state(battle, caller, request.headers.get("X-Host-Token", ""), request.query_params.get("since", ""))
        if data is None:
            raise Http404
        return Response(data)
```

`urls.py`: `path("battles/<str:code>/", DetailView.as_view(), name="detail"),` (después de `join` y `start` para que no los tape; el orden no afecta por las barras finales).

- [ ] **Step 4: Run** — `.venv/bin/pytest battles -q` — Expected: all pass.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat: battle state for polling devices, with since/key and no leaks"`

---

## Task 9: Responder y puntuar

**Files:**
- Modify: `backend/battles/services.py`, `backend/battles/views.py`, `backend/battles/urls.py`
- Create: `backend/battles/tests/test_answer.py`

**Interfaces:**
- Produces: `services.submit_answer(battle, player, song_id, now) -> BattleAnswer`; `services.ranking(battle) -> list[dict]` (`position`, `name`, `points`, `correct`; ordenado por puntos desc, aciertos desc, nombre); `POST /api/battles/<code>/answer/` body `{"song_id": int}` → `200 {"received": true}`; `battles:answer`.

Reglas: solo jugadores (el organizador recibe 404); solo con la batalla en `playing` y la fase `playing`; entre `starts_at` (incluido) y `ends_at` (excluido), medido con la hora del servidor; una respuesta por ronda (la primera; las siguientes devuelven `received: true` sin cambiar nada); no revela si acertó. Puntos: `BASE_POINTS + round(BONUS_MAX * (1 - elapsed/round_seconds))` si acierta, 0 si no. Cada respuesta sube `version`.

- [ ] **Step 1: Write the failing tests** — `backend/battles/tests/test_answer.py` (cubre: acierto da `100 + bonus` según el tiempo transcurrido, con `now` inyectado; fallo da 0; fuera de ventana (antes de `starts_at`, en `ends_at`, después) → 400; segunda respuesta se ignora; el organizador → 404; no miembro → 404; `song_id` inválido → 400; la respuesta no incluye `correct`; `ranking` ordena y desempata). Ejemplo base:

```python
def test_a_fast_correct_answer_gets_base_plus_bonus(running, ...):
    # round 0 plays from T0+5 to T0+15 (10 s): answering at +5 s of the round is half the bonus
    answer = services.submit_answer(running, ana, correct_song_id, at(10))
    assert answer.correct and answer.points == 100 + 25
```

El endpoint llama `submit_answer(battle, player, song_id, timezone.now())`; las pruebas del servicio inyectan `now`; la de la vista parchea `battles.views.timezone.now`.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** — en `services.py`:

```python
from .timeline import phase_at


def _rounds(battle):
    return list(battle.rounds.select_related("song"))


def submit_answer(battle, player, song_id, now):
    if battle.status != Battle.PLAYING:
        raise ValidationError({"detail": "La batalla no está en juego."})
    rounds = _rounds(battle)
    phase = phase_at(rounds, now, settings.BATTLES["REVEAL_SECONDS"])
    if phase.name != "playing":
        raise ValidationError({"detail": "No hay una ronda abierta."})
    current = rounds[phase.index]
    if not (current.starts_at <= now < current.ends_at):
        raise ValidationError({"detail": "No hay una ronda abierta."})
    try:
        guessed = Song.objects.get(pk=song_id)
    except (Song.DoesNotExist, ValueError, TypeError):
        raise ValidationError({"detail": "Canción no encontrada."})
    cfg = settings.BATTLES
    correct = guessed.pk == current.song_id
    points = 0
    if correct:
        elapsed = (now - current.starts_at).total_seconds()
        points = cfg["BASE_POINTS"] + round(cfg["BONUS_MAX"] * (1 - elapsed / battle.round_seconds))
    try:
        with transaction.atomic():
            answer = BattleAnswer.objects.create(round=current, player=player, song_guessed=guessed, correct=correct, received_at=now, points=points)
    except IntegrityError:
        return BattleAnswer.objects.get(round=current, player=player)  # the first answer stands
    Battle.objects.filter(pk=battle.pk).update(version=F("version") + 1)
    return answer


def ranking(battle):
    rows = [
        {"name": p.display_name, "points": p.total or 0, "correct": p.hits or 0}
        for p in battle.players.annotate(total=Sum("answers__points"), hits=Count("answers", filter=Q(answers__correct=True)))
    ]
    rows.sort(key=lambda r: (-r["points"], -r["correct"], r["name"].lower()))
    for position, row in enumerate(rows, start=1):
        row["position"] = position
    return rows
```

(imports: `Sum`, `Count`, `Q` de `django.db.models`, `BattleAnswer`.) La vista valida con `player_for`; si es el organizador o no miembro → `Http404`.

- [ ] **Step 4: Run** — `.venv/bin/pytest battles -q` — Expected: all pass.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat: answer a round with a server-side clock and score it"`

---

## Task 10: "Mis batallas" y acceso privado

**Files:**
- Modify: `backend/battles/services.py`, `backend/battles/views.py`, `backend/battles/urls.py`
- Create: `backend/battles/tests/test_mine.py`

**Interfaces:**
- Produces: `GET /api/battles/mine/` (`battles:mine`) → `{"battles": [{"code","title","status","created_at","players_count","role","my_position"}]}` (más recientes primero, máximo 50). `my_position` solo si la batalla terminó y es jugador. El detalle de una batalla `finished` ya lo cubre `GET /<code>/` (Task 8) con `ranking` completo para miembros.

Importante: `mine` debe ir **antes** de `<code>/` en `urls.py` para que `mine` no se interprete como un código.

- [ ] **Step 1: Write the failing tests** — cubren: el organizador ve su batalla con `role: host`; un jugador ve la suya con `role: player` y `my_position`; una persona sin relación no ve nada (lista vacía) y recibe 404 al pedir el detalle de una batalla terminada de otros; con cuenta, ve las batallas de su cuenta aunque jugara desde otro dispositivo; sin sesión no ve las batallas de una cuenta jugadas desde el mismo dispositivo; orden y límite de 50.

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** — `services.my_battles(caller)`:

```python
def my_battles(caller):
    if caller.user is not None:
        scope = Q(host_user=caller.user) | Q(players__user=caller.user)
    else:
        scope = (Q(host_device_id=caller.device_id, host_user__isnull=True)) | Q(players__device_id=caller.device_id, players__user__isnull=True)
    battles = Battle.objects.filter(scope).distinct().annotate(players_count=Count("players", distinct=True)).order_by("-created_at")[:50]
    out = []
    for b in battles:
        mine = player_for(b, caller)
        position = None
        if mine is not None and b.status == Battle.FINISHED:
            position = next((r["position"] for r in ranking(b) if r["name"] == mine.display_name), None)
        out.append(
            {"code": b.code, "title": b.title, "status": b.status, "created_at": b.created_at, "players_count": b.players_count,
             "role": "player" if mine else "host", "my_position": position}
        )
    return out
```

La vista `MineView` (`throttle_scope = "battle-state"`, `skip_global_throttle = True`) devuelve `{"battles": services.my_battles(caller)}`.

- [ ] **Step 4: Run** — Expected: all pass.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat: my battles, private to who played or created them"`

---

## Task 11: Las batallas siguen a la cuenta

**Files:**
- Modify: `backend/accounts/claim.py`
- Create: `backend/battles/tests/test_claim.py`

**Interfaces:**
- Consumes: `battles.models`.
- Produces: `claim_device_battles(user, device_id)`, llamada desde `claim_device_games`.

Reglas: los `BattlePlayer` de ese dispositivo sin cuenta pasan a la cuenta (salvo que la cuenta ya sea jugadora de esa batalla: se deja como está); las batallas con `host_device_id == device_id` y sin `host_user` pasan a `host_user = user` y `host_device_id = ""`.

- [ ] **Step 1: Write the failing test**

```python
def test_battles_played_on_the_device_move_to_the_account(db, django_user_model):
    user = django_user_model.objects.create_user(username="u", email="u@x.uy", password="x" * 12)
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    mine = BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    hosted = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=D2)
    claim_device_games(user, D2)
    mine.refresh_from_db(); hosted.refresh_from_db()
    assert mine.user == user and hosted.host_user == user and hosted.host_device_id == ""


def test_if_the_account_already_plays_that_battle_the_device_row_stays(db, django_user_model):
    user = django_user_model.objects.create_user(username="u", email="u@x.uy", password="x" * 12)
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    BattlePlayer.objects.create(battle=b, user=user, display_name="Ana")
    other = BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana 2")
    claim_device_games(user, D2)
    other.refresh_from_db()
    assert other.user is None
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement** — en `accounts/claim.py`, al final de `claim_device_games` (antes de `adopt_device_stats`, dentro de `if device_id is None: return` ya cubierto):

```python
    claim_device_battles(user, device_id)
```

y la función:

```python
def claim_device_battles(user, device_id):
    from battles.models import Battle, BattlePlayer  # imported here: battles depends on gameplay, which this module also uses

    for player in BattlePlayer.objects.filter(device_id=device_id, user__isnull=True):
        if BattlePlayer.objects.filter(battle=player.battle, user=user).exists():
            continue  # the account already plays that battle: one player per person
        player.user = user
        player.device_id = ""
        player.save(update_fields=["user", "device_id"])
    Battle.objects.filter(host_device_id=device_id, host_user__isnull=True).update(host_user=user, host_device_id="")
```

- [ ] **Step 4: Run** — `.venv/bin/pytest -q` (suite completa) — Expected: all pass.

- [ ] **Step 5: Commit** — `git add backend && git commit -m "feat: battles follow the account when it is created"`

---

## Task 12: Contrato de la API

**Files:**
- Create: `docs/contrato-api-batallas.md`

- [ ] **Step 1:** Documentar, con ejemplos de pedido/respuesta, cabeceras (`X-Device-Id`, `X-Host-Token`, `Authorization`), cada endpoint (`POST /api/battles/`, `POST .../join/`, `POST .../start/`, `GET .../` con `since`/`key`, `POST .../answer/`, `GET /api/battles/mine/`), los códigos de error, los límites, las fases y su cronograma, la regla de que `404` es la respuesta para quien no participó, y el consejo de intervalos de consulta: 3 s en el lobby y entre rondas, 1,5 s en la cuenta regresiva y 2 s durante la ronda.
- [ ] **Step 2: Commit** — `git add docs && git commit -m "docs: Battle API contract"`

---

## Task 13: Cliente de API del frontend

**Files:**
- Create: `frontend/app/lib/batallas/api-batallas.ts`, `frontend/app/lib/batallas/api-batallas.test.ts`

**Interfaces:**
- Produces: `crearApiBatallas()` con `crear({rondas?, segundos?, titulo?})`, `unirse(code, nombre, hostToken?)`, `empezar(code, hostToken?)`, `estado(code, {since?, hostToken?})`, `responder(code, songId)`, `mias()`. Todas mandan `X-Device-Id` (como `api-cuenta.ts`, vía `pedir`/`pedirConPase` de `../juego/http` y `../humano/pedir-con-pase`) y `Authorization` si hay sesión. Tipos exportados: `EstadoSala`, `EstadoSinCambios`, `SalaUnible`, `BatallaResumen`.
- La clave del organizador (`host_token`) se guarda en `localStorage` bajo `batalla-host-<code>` con funciones `guardarHostToken(code, token)` / `leerHostToken(code)` (con `try/catch`, el almacenamiento puede fallar).

- [ ] **Step 1: Write the failing test** — con `fetch` simulado (mismo estilo que `api-cuenta.test.ts`): `crear` hace `POST /api/battles/` con `X-Device-Id` y el cuerpo solo con los campos presentes; `estado` agrega `?since=` solo si se pasa y manda `X-Host-Token` si hay; `responder` manda `{song_id}`; `mias` hace `GET /api/battles/mine/`; los errores de la API llegan como `Error` con el mensaje del `detail` (como el resto de los clientes).
- [ ] **Step 2: Run** — `cd frontend && npx vitest run app/lib/batallas` — Expected: FAIL.
- [ ] **Step 3: Implement** el cliente siguiendo `api-cuenta.ts` (`enviar`, `comoJson`).
- [ ] **Step 4: Run** — Expected: PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5: Commit** — `git add frontend && git commit -m "feat: Battle API client"`

---

## Task 14: Consulta periódica con desfase de reloj

**Files:**
- Create: `frontend/app/lib/batallas/useSala.ts`, `frontend/app/lib/batallas/useSala.test.tsx`

**Interfaces:**
- Produces: `useSala(code, api = crearApiBatallas())` → `{ sala: EstadoSala | SalaUnible | null, error: string | null, ahora(): number, refrescar(): void }`. `ahora()` devuelve la hora del servidor estimada (`Date.now() + desfase`, con el desfase calculado de `server_time` de cada respuesta, tomando el menor retardo observado). Intervalo según fase: 3000 ms en `lobby`/`reveal`/`finished`, 1500 ms en `countdown`, 2000 ms en `playing`; pausa cuando la pestaña está oculta y consulta apenas vuelve a verse; un error de red no corta la consulta (reintenta con el mismo intervalo y expone `error`); manda `since` con el último `key`; ante `changed: false` conserva la sala anterior; al terminar (`finished`) deja de consultar tras una última vez.

- [ ] **Step 1: Write the failing test** con `vi.useFakeTimers()` y una API simulada: (a) consulta de inmediato y luego cada 3 s en `lobby`; (b) manda `since` con la última `key` y no reemplaza la sala cuando `changed: false`; (c) `ahora()` corrige un reloj local atrasado 10 s usando `server_time`; (d) tras un error de red sigue consultando; (e) deja de consultar al llegar a `finished`; (f) se desmonta limpiando el temporizador.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** el hook con `useEffect`, `setTimeout` encadenado (no `setInterval`, para no apilar consultas lentas) y `document.visibilitychange`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add frontend && git commit -m "feat: polling hook with the server clock offset"`

---

## Task 15: Crear la sala y compartirla

**Files:**
- Create: `frontend/app/batalla/page.tsx`, `frontend/app/batalla/CrearBatalla.tsx`, `frontend/app/batalla/CrearBatalla.test.tsx`, `frontend/app/batalla/batalla.css`
- Modify: `frontend/package.json` (dependencia `qrcode` y `@types/qrcode`), `frontend/app/lib/paginas.ts` (si lista rutas), la barra de navegación (enlace "Batalla" detrás de `NEXT_PUBLIC_BATALLA_ACTIVA`, que ya existe y está apagado por defecto)

**Interfaces:**
- Consumes: `crearApiBatallas().crear`, `guardarHostToken`.
- Produces: pantalla `/batalla` con campos "Título (opcional)", "Canciones" (3–30, por defecto 10), "Segundos por ronda" (5–60, por defecto 20) y el botón "Crear sala"; al crear guarda el `host_token` y navega a `/batalla/<code>`.

- [ ] **Step 1: Write the failing test** — rellena el formulario, espera la llamada a `crear` con los valores, `guardarHostToken` y `router.push("/batalla/ABC123")`; valida los límites en pantalla (mensaje en español, sin llamar a la API); muestra el error de la API.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** la pantalla (con `vi.mock("next/navigation")` en la prueba). La página `/batalla` y la ruta `[code]` devuelven `notFound()` cuando `NEXT_PUBLIC_BATALLA_ACTIVA` no está activo, para poder mergear sin exponer la función.
- [ ] **Step 4: Run** — Expected: PASS; `tsc` limpio.
- [ ] **Step 5: Commit** — `git add frontend && git commit -m "feat: create a battle screen"`

---

## Task 16: Sala: lobby, ronda y resultados

**Files:**
- Create: `frontend/app/batalla/[code]/page.tsx`, `frontend/app/batalla/Sala.tsx`, `Lobby.tsx`, `Ronda.tsx`, `Resultados.tsx` y una prueba por componente (`*.test.tsx`)
- Modify: `frontend/app/batalla/batalla.css`

**Interfaces:**
- Consumes: `useSala`, `crearApiBatallas`, el buscador de canciones del juego diario (reutilizar el componente de búsqueda existente en `app/jugar`; leerlo antes de usarlo y extraerlo a un componente compartido solo si hace falta, sin cambiar el juego diario), `qrcode`.
- Produces:
  - `Sala({code})`: decide la vista según `sala` — no unible/404 → "No encontramos esta sala"; `joinable` → formulario "Tu nombre" + "Entrar"; `lobby` → `Lobby`; `playing` → `Ronda`; `finished` o `reveal` → `Resultados`.
  - `Lobby`: link para copiar y QR (`qrcode`), lista de participantes que se actualiza sola; para quien organiza, botón "Empezar" (deshabilitado con menos de 2 jugadores) y el mensaje "Quien organiza no juega"; para jugadores, "Esperando que empiece…".
  - `Ronda` (jugadores): cuenta regresiva hasta `starts_at` con `ahora()`; **botón "Tocá para empezar" en cada ronda** para poder reproducir (restricción de iPhone); reproduce `preview_url` con un `<audio>`; precarga el de la ronda siguiente; el buscador de canciones; al elegir, `responder`, y la pantalla muestra "Respuesta enviada" sin decir si acertó; cuenta regresiva de la ronda con una barra. Si el audio falla: "No pudimos reproducir esta canción; igual podés responder".
  - `Ronda` (organizador): "Ronda N de M", cuántos respondieron (`answered`), sin audio.
  - `Resultados`: en `reveal`, la canción correcta, tu respuesta con puntos, y el ranking parcial; en `finished`, el ranking final y los botones "Volver a las batallas" (a `/ranking?vista=batallas`) y "Crear otra batalla".

- [ ] **Step 1: Write the failing tests** — por componente, con `useSala` simulado: `Sala` elige la vista por estado; `Lobby` muestra el link, el QR y habilita "Empezar" solo con ≥2 jugadores y solo para el organizador; `Ronda` no reproduce hasta el toque, manda `responder` una sola vez, no muestra si acertó, y el organizador no ve el buscador ni el audio; `Resultados` muestra la canción y el ranking.
- [ ] **Step 2: Run** — `npx vitest run app/batalla` — Expected: FAIL.
- [ ] **Step 3: Implement**, de a un componente por vez (prueba → código → siguiente), reutilizando clases del diseño existente; el CSS en `batalla.css`.
- [ ] **Step 4: Run** — Expected: PASS; `tsc` limpio; revisión visual en el navegador local con una sala de 2 dispositivos (dos pestañas con distinto `device_id`).
- [ ] **Step 5: Commit** — `git add frontend && git commit -m "feat: battle room: lobby, rounds and results"`

---

## Task 17: "Mis batallas" en el ranking

**Files:**
- Create: `frontend/app/ranking/MisBatallas.tsx`, `frontend/app/ranking/MisBatallas.test.tsx`
- Modify: `frontend/app/ranking/Ranking.tsx`, `frontend/app/ranking/Ranking.test.tsx`, `frontend/app/ranking/ranking.css`

**Interfaces:**
- Consumes: `crearApiBatallas().mias()` y `estado(code)` para abrir una batalla terminada.
- Produces: selector "Diario | Mis batallas" arriba de `/ranking` (visible solo con `NEXT_PUBLIC_BATALLA_ACTIVA`); `?vista=batallas` abre directo en "Mis batallas"; la lista muestra título (o fecha), cantidad de jugadores, rol y tu posición; al tocar una batalla terminada se ve su ranking con las mismas filas del ranking diario; una batalla en curso lleva a `/batalla/<code>`. Sin batallas: "Todavía no jugaste ninguna batalla" con el botón "Crear una batalla".

- [ ] **Step 1: Write the failing tests** — `Ranking` sigue igual sin el selector cuando la función está apagada; con la función encendida, el selector cambia entre vistas y respeta `?vista=batallas`; `MisBatallas` muestra la lista, el estado vacío y el ranking de una batalla abierta; no hay ningún botón de compartir que muestre resultados públicos.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** reutilizando las filas de `Piezas.tsx`.
- [ ] **Step 4: Run** — `npx vitest run` (suite completa) — Expected: PASS; `tsc` limpio.
- [ ] **Step 5: Commit** — `git add frontend && git commit -m "feat: My battles in the ranking screen"`

---

## Task 18: Prueba de carga con 50 jugadores simulados

**Files:**
- Create: `scripts/carga-batallas.py`, `docs/carga-batallas.md`

**Interfaces:**
- Produces: un script que, contra una URL base (por defecto `http://localhost:8000`), crea una sala, une a N jugadores (por defecto 50, cada uno con su `X-Device-Id`), empieza, y hace que cada jugador consulte el estado con `since` según los intervalos del contrato y responda en cada ronda; al final imprime pedidos por segundo, latencia p50/p95/p99, errores y 429.

- [ ] **Step 1:** Escribir el script con `concurrent.futures` o `asyncio` + `httpx` (usar lo que ya esté en `requirements-dev.txt`; si no hay cliente concurrente, `threading` con `requests`).
- [ ] **Step 2:** Correrlo en local con `gunicorn config.wsgi --threads 4` y con 1 proceso sin hilos, 50 jugadores y 10 rondas. Anotar los resultados en `docs/carga-batallas.md`.
- [ ] **Step 3:** Si el p95 de la consulta de estado supera 500 ms, optimizar (caché del `key` en memoria por batalla; `select_related`) y repetir. Sumar `--threads 4` al `startCommand` de `render.yaml` si ayuda, **sin desplegarlo todavía**: se decide con Brandon.
- [ ] **Step 4: Commit** — `git add scripts docs render.yaml && git commit -m "test: load test for 50 simulated players"`

---

## Task 19: Revisión final y salida

- [ ] **Step 1:** `cd backend && .venv/bin/pytest -q` y `cd frontend && npx vitest run && npx tsc --noEmit` — todo verde. Restaurar los archivos generados del frontend.
- [ ] **Step 2:** Recorrida manual en local con dos dispositivos: crear, unirse por link, empezar, jugar 3 rondas, ver resultados y "Mis batallas"; comprobar que un tercer dispositivo ajeno recibe "No encontramos esta sala" al abrir la batalla terminada.
- [ ] **Step 3:** Revisión de la rama entera por un revisor independiente (el de la skill de plan) contra el Review Focus; arreglar lo Crítico/Importante con prueba primero.
- [ ] **Step 4:** Abrir el PR **sin mergear** (la función queda detrás de `NEXT_PUBLIC_BATALLA_ACTIVA`, apagado): el despliegue del backend corre la migración `battles/0001` en Render. Brandon decide el merge y cuándo encender la función.

---

## Self-review

- **Cobertura del spec:** sala y link/QR (T15–16), entrar con nombre único en la sala (T6), organizador que no juega (T6, T9, T16), azar con preview (T7), audio propio por dispositivo (T16), ranking por ronda y final (T8–9), "Mis batallas" privado con 404 (T8, T10, T17), cuentas (T11), sin sockets y tiempo del servidor (T2, T8, T9, T14), capacidad y límite global por IP (T5, T18), contrato (T12).
- **Rulings respecto del spec** (para registrar en el ledger al ejecutar): (1) el cronograma de todas las rondas se **fija al empezar** en vez de avanzar por transiciones al consultar; el estado sigue calculándose al consultar y no hay procesos en segundo plano. (2) El puntaje de cada jugador se **calcula sumando sus respuestas**, no se guarda como columna. (3) La respuesta del `POST /answer/` no revela si acertó; se muestra en la fase `reveal`. (4) `X-Host-Token` o la identidad del organizador sirven para organizar. (5) El organizador no recibe `preview_url`.
- **Placeholders:** las Tasks 8, 9 y 10 resumen el contenido de las pruebas en vez de transcribirlas todas; el implementador debe escribir cada caso listado como prueba real antes del código. Las Tasks 13 a 17 (frontend) describen el comportamiento y las pruebas por componente; el código se escribe siguiendo `api-cuenta.ts` y los componentes existentes.
- **Consistencia de nombres:** `Caller`, `get_caller`, `player_for`, `is_host`, `is_member`, `build_schedule`, `phase_at`, `preview_url`, `create_battle`, `join_battle`, `start_battle`, `submit_answer`, `ranking`, `my_battles`, `claim_device_battles`; URLs `battles:create|join|start|detail|answer|mine`; scopes `battle-create|join|answer|state`.
