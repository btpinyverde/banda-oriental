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
