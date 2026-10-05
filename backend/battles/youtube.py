"""Reading a YouTube link the organizer pastes: the video id, its title (oEmbed, no key needed) and the catalog songs it could be."""
import re
from urllib.parse import parse_qs, urlparse

import requests
from rest_framework.exceptions import ValidationError

from catalog.models import Song
from catalog.search import filter_by_text, strip_accents

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"}
OEMBED = "https://www.youtube.com/oembed"
NOISE = re.compile(r"\b(official|oficial|video|videoclip|clip|lyrics|letra|audio|hd|hq|4k|vevo|remastered|remasterizado)\b", re.I)


def extract_video_id(url):
    """The 11-character video id of a YouTube link (watch, youtu.be, shorts, embed, live) or of a bare id; None otherwise."""
    if not isinstance(url, str) or not url.strip():
        return None
    text = url.strip()
    if VIDEO_ID.match(text):
        return text
    try:
        parsed = urlparse(text if "//" in text else f"https://{text}")
    except ValueError:
        return None
    if (parsed.hostname or "").lower() not in HOSTS:
        return None
    parts = [p for p in parsed.path.split("/") if p]
    candidate = None
    if parsed.hostname.lower().endswith("youtu.be"):
        candidate = parts[0] if parts else None
    elif parts and parts[0] in ("shorts", "embed", "live", "v") and len(parts) > 1:
        candidate = parts[1]
    else:
        candidate = (parse_qs(parsed.query).get("v") or [None])[0]
    return candidate if candidate and VIDEO_ID.match(candidate) else None


def _plain(text):
    return re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", strip_accents(text or "").lower())).strip()


def suggestions(title, author):
    """Up to five catalog songs the video could be, best first: the words of the title must appear in the song's title or artist;
    when the whole title does not match, each part ("Artista - Tema") is tried on its own, preferring songs whose artist is named."""
    cleaned = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", title or "")
    cleaned = NOISE.sub(" ", cleaned)
    songs = Song.objects.filter(hidden=False).select_related("album__artist")
    whole = _plain(cleaned)
    found = list(filter_by_text(songs, whole, ["title", "album__artist__name"])[:20]) if whole else []
    if not found:
        for part in re.split(r"\s[-–—|:]\s|\s[-–—|:]|[-–—|:]\s", cleaned):
            part = _plain(part)
            if len(part) >= 3:
                found += list(filter_by_text(songs, part, ["title"])[:20])
    named = _plain(f"{cleaned} {author or ''}")
    unique = {s.pk: s for s in found}.values()
    ranked = sorted(unique, key=lambda s: (0 if _plain(s.album.artist.name) in named else 1, len(s.title), s.pk))
    return ranked[:5]


def lookup(url):
    """`{youtube_id, title, author, songs}` for a link, or a 400 saying why it cannot be used."""
    video_id = extract_video_id(url)
    if video_id is None:
        raise ValidationError({"url": "Ese no parece un enlace de YouTube."})
    try:
        response = requests.get(OEMBED, params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"}, timeout=8)
    except requests.RequestException:
        raise ValidationError({"url": "No pudimos leer ese enlace ahora. Probá de nuevo."})
    if response.status_code == 401:
        # oEmbed answers 401 for a video whose owner does not allow playing it outside YouTube: it would not play here either.
        raise ValidationError({"url": "Ese video no permite reproducirse fuera de YouTube. Probá con otro."})
    if response.status_code == 404:
        raise ValidationError({"url": "No encontramos ese video."})
    if response.status_code != 200:
        raise ValidationError({"url": "No pudimos leer ese enlace ahora. Probá de nuevo."})
    data = response.json()
    title, author = data.get("title", ""), data.get("author_name", "")
    return {"youtube_id": video_id, "title": title, "author": author, "songs": suggestions(title, author)}
