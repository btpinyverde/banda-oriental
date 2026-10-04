import logging
import time

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://musicbrainz.org/ws/2"
USER_AGENT = "BandaOriental/0.1 ( https://github.com/btpinyverde/banda-oriental )"

_last_request_at = 0.0
# MusicBrainz asks for at most one request per second on average; a little over that keeps long runs under the limit.
_MIN_INTERVAL_SECONDS = 1.2

# MusicBrainz answers 503 (and sometimes 429) when it is overloaded or when a client has been asking too much, and
# says how long to wait in Retry-After. Those, and a network that hiccups, are worth waiting for; anything else
# (400, 404...) is a real error and is raised at once.
REQUEST_TIMEOUT_SECONDS = 30
MAX_ATTEMPTS = 6
RETRY_STATUSES = {429, 502, 503, 504}
BASE_WAIT_SECONDS = 15
MAX_WAIT_SECONDS = 300


def _throttle():
    global _last_request_at
    elapsed = time.time() - _last_request_at
    if elapsed < _MIN_INTERVAL_SECONDS:
        time.sleep(_MIN_INTERVAL_SECONDS - elapsed)
    _last_request_at = time.time()


def _wait_before_retry(attempt, response=None):
    """What the server asked for (Retry-After, in seconds) or, without it, a wait that doubles each time."""
    asked = response.headers.get("Retry-After") if response is not None else None
    try:
        seconds = float(asked)
    except (TypeError, ValueError):
        seconds = BASE_WAIT_SECONDS * 2 ** (attempt - 1)
    return min(MAX_WAIT_SECONDS, max(0.0, seconds))


def _get(path, params):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        _throttle()
        last_try = attempt == MAX_ATTEMPTS
        try:
            response = requests.get(
                f"{BASE_URL}/{path}",
                params={**params, "fmt": "json"},
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
        except (requests.Timeout, requests.ConnectionError) as error:
            if last_try:
                raise
            wait = _wait_before_retry(attempt)
            logger.warning("MusicBrainz no respondió (%s); espero %.0f s (intento %d de %d)", type(error).__name__, wait, attempt, MAX_ATTEMPTS)
            time.sleep(wait)
            continue
        if response.status_code in RETRY_STATUSES and not last_try:
            wait = _wait_before_retry(attempt, response)
            logger.warning("MusicBrainz respondió %s; espero %.0f s (intento %d de %d)", response.status_code, wait, attempt, MAX_ATTEMPTS)
            time.sleep(wait)
            continue
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
        if rg.get("secondary-types"):
            # Skip compilations, live albums, remixes, etc. — the same
            # recording routinely appears on these and on the original
            # studio album; keeping both lets whichever syncs last steal
            # the song's album/year.
            continue
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
