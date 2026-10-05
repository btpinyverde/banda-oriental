"""The ordered list of songs an organizer picks by hand: each item is a catalog song, played from its Deezer preview or from a
YouTube video (`{song_id, source, youtube_id, start_seconds}`)."""
import re

from django.conf import settings
from rest_framework.exceptions import ValidationError

from catalog.models import Song

YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
SOURCES = ("deezer", "youtube")
MAX_START_SECONDS = 600


def _fail(message):
    raise ValidationError({"playlist": message})


def clean_playlist(raw):
    """The list validated and normalized, or a 400. Songs must exist, be visible and not repeat."""
    if not isinstance(raw, list) or not raw:
        _fail("Armá la lista con al menos una canción.")
    maximum = settings.BATTLES["MAX_ROUNDS"]
    if len(raw) > maximum:
        _fail(f"La lista puede tener hasta {maximum} canciones.")
    items, seen = [], set()
    for entry in raw:
        if not isinstance(entry, dict):
            _fail("Cada canción de la lista tiene que ser un objeto.")
        song_id, source = entry.get("song_id"), entry.get("source", "deezer")
        if isinstance(song_id, bool) or not isinstance(song_id, int):
            _fail("Falta la canción en un elemento de la lista.")
        if source not in SOURCES:
            _fail("La fuente de una canción tiene que ser deezer o youtube.")
        if song_id in seen:
            _fail("Hay una canción repetida en la lista.")
        seen.add(song_id)
        start = entry.get("start_seconds", 0)
        if isinstance(start, bool) or not isinstance(start, int) or not 0 <= start <= MAX_START_SECONDS:
            _fail(f"El segundo de inicio tiene que estar entre 0 y {MAX_START_SECONDS}.")
        youtube_id = entry.get("youtube_id", "")
        if source == "youtube":
            if not isinstance(youtube_id, str) or not YOUTUBE_ID.match(youtube_id):
                _fail("El video de YouTube no es válido.")
        else:
            youtube_id, start = "", 0
        items.append({"song_id": song_id, "source": source, "youtube_id": youtube_id, "start_seconds": start})
    found = set(Song.objects.filter(pk__in=seen, hidden=False).values_list("pk", flat=True))
    if found != seen:
        _fail("Hay una canción de la lista que no existe en el catálogo.")
    return items
