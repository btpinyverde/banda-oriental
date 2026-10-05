"""Cliente mínimo de la API pública de Deezer (sin clave): artistas, lanzamientos y canciones.

Pensado para no dar sorpresas al importar miles de artistas:
- Va despacio (unos 3 pedidos por segundo; Deezer permite alrededor de 50 cada 5 s).
- Reintenta con espera creciente si falla la red, si Deezer responde 5xx/429 o avisa que se pasó de cuota.
- Un error que no se arregla reintentando (permiso, formato) corta enseguida con un mensaje claro.
- Devuelve datos ya normalizados (año como número, duración en segundos o None, textos vacíos en vez de None).
"""
import time

import requests

BASE_URL = "https://api.deezer.com"
TIMEOUT_SECONDS = 15
MIN_INTERVAL_SECONDS = 0.34
MAX_ATTEMPTS = 4
PAGE_SIZE = 100

QUOTA_ERROR_CODE = 4
NOT_FOUND_ERROR_CODE = 800

_last_request_at = 0.0


class DeezerError(Exception):
    """Deezer no pudo responder (tras reintentar) o respondió algo que no esperamos."""


class DeezerNotFound(DeezerError):
    """El recurso pedido no existe en Deezer."""


def _throttle():
    global _last_request_at
    elapsed = time.time() - _last_request_at
    if elapsed < MIN_INTERVAL_SECONDS:
        time.sleep(MIN_INTERVAL_SECONDS - elapsed)
    _last_request_at = time.time()


def _get(path, params=None):
    last_problem = "sin respuesta"
    for attempt in range(1, MAX_ATTEMPTS + 1):
        if attempt > 1:
            time.sleep(min(2 * 2 ** (attempt - 1), 30))
        _throttle()
        try:
            response = requests.get(f"{BASE_URL}{path}", params=params or {}, timeout=TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            last_problem = f"error de red ({type(exc).__name__})"
            continue
        if response.status_code == 429 or response.status_code >= 500:
            last_problem = f"HTTP {response.status_code}"
            continue
        try:
            body = response.json()
        except ValueError:
            last_problem = "respuesta que no es JSON"
            continue

        error = body.get("error") if isinstance(body, dict) else None
        if not error:
            return body
        code = error.get("code")
        if code == QUOTA_ERROR_CODE:
            last_problem = "cuota excedida"
            continue
        if code == NOT_FOUND_ERROR_CODE:
            raise DeezerNotFound(f"{path}: no existe en Deezer")
        raise DeezerError(f"{path}: {error.get('type')} {code}: {error.get('message')}")

    raise DeezerError(f"{path}: se rindió tras {MAX_ATTEMPTS} intentos ({last_problem})")


def _pages(path):
    """Todos los elementos de un listado paginado de Deezer."""
    items, index = [], 0
    while True:
        body = _get(path, {"limit": PAGE_SIZE, "index": index})
        items.extend(body.get("data", []))
        if "next" not in body:
            return items
        index += PAGE_SIZE


def _photo(raw):
    """The artist's photo (the biggest size Deezer has), or "" if it has none. Deezer gives a grey silhouette (a URL with an
    empty hash, ".../artist//...") to artists without a photo: that is not a photo. Only https URLs are taken."""
    for key in ("picture_xl", "picture_big", "picture_medium"):
        url = raw.get(key) or ""
        if url.startswith("https://") and "/artist//" not in url:
            return url
    return ""


def search_artists(name):
    body = _get("/search/artist", {"q": name, "limit": 10})
    return [
        {
            "id": a["id"],
            "name": a["name"],
            "nb_album": a.get("nb_album", 0),
            "nb_fan": a.get("nb_fan", 0),
            "picture": _photo(a),
        }
        for a in body.get("data", [])
    ]


def get_artist(artist_id):
    raw = _get(f"/artist/{artist_id}")
    return {"id": raw["id"], "name": raw["name"], "picture": _photo(raw)}


def get_artist_releases(artist_id):
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "record_type": r.get("record_type", ""),
            "release_date": r.get("release_date"),
        }
        for r in _pages(f"/artist/{artist_id}/albums")
    ]


def _year(release_date):
    prefix = (release_date or "")[:4]
    return int(prefix) if prefix.isdigit() and int(prefix) > 0 else None


def _track(raw):
    return {"id": raw["id"], "title": raw["title"], "duration_seconds": raw.get("duration") or None}


def get_album(album_id):
    raw = _get(f"/album/{album_id}")
    embedded = raw.get("tracks", {}).get("data", [])
    tracks = embedded
    if raw.get("nb_tracks", len(embedded)) > len(embedded):
        # El disco trae solo una parte de las canciones: se piden todas por separado.
        tracks = _pages(f"/album/{album_id}/tracks")
    genres = raw.get("genres", {}).get("data", [])
    return {
        "id": raw["id"],
        "title": raw["title"],
        "record_type": raw.get("record_type", ""),
        "year": _year(raw.get("release_date")),
        "genre": genres[0]["name"] if genres else "",
        "cover_url": raw.get("cover_xl") or raw.get("cover_big") or "",
        "tracks": [_track(t) for t in tracks],
    }
