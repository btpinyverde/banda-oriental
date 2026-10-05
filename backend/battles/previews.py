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
