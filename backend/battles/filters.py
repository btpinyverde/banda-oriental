"""Segmenting the songs that come up when the organizer does not pick them one by one.

`filters = {"include": {...}, "exclude": {...}}`. Include: year_from, year_to, genres, artists (ids), release_types,
duration_min, duration_max. Exclude: genres, artists, release_types, years (list of [from, to]), songs (ids). An empty
filter filters nothing; everything combines with AND. The base rules always apply: visible songs with a Deezer id.
"""
from django.db.models import Q
from rest_framework.exceptions import ValidationError

from catalog.models import Album, Song

YEAR_MIN, YEAR_MAX = 1900, 2100
INCLUDE_KEYS = {"year_from", "year_to", "genres", "artists", "release_types", "duration_min", "duration_max"}
EXCLUDE_KEYS = {"genres", "artists", "release_types", "years", "songs"}
RELEASE_TYPES = {key for key, _ in Album.RELEASE_TYPES}
MAX_GENRES, MAX_ARTISTS, MAX_SONGS, MAX_RANGES = 30, 100, 500, 10


def _fail(message):
    raise ValidationError({"filters": message})


def _int(value, low, high, label):
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        _fail(f"{label}: tiene que ser un número entre {low} y {high}.")
    return value


def _list(value, label, limit):
    if not isinstance(value, list):
        _fail(f"{label}: tiene que ser una lista.")
    if len(value) > limit:
        _fail(f"{label}: demasiados elementos (máximo {limit}).")
    return value


def _words(value, label):
    out = []
    for item in _list(value, label, MAX_GENRES):
        if not isinstance(item, str):
            _fail(f"{label}: tiene que ser una lista de textos.")
        if item.strip():
            out.append(item.strip())
    return out


def _ids(value, label, limit):
    out = []
    for item in _list(value, label, limit):
        out.append(_int(item, 1, 2**31, label))
    return out


def _kinds(value, label):
    kinds = _words(value, label)
    if any(k not in RELEASE_TYPES for k in kinds):
        _fail(f"{label}: los tipos válidos son {', '.join(sorted(RELEASE_TYPES))}.")
    return kinds


def clean_filters(raw):
    """The filters validated and normalized (empty ones dropped); raises a 400 for anything unexpected."""
    if raw is None:
        raw = {}
    if not isinstance(raw, dict) or set(raw) - {"include", "exclude"}:
        _fail("Los filtros tienen que ser {include, exclude}.")
    include, exclude = raw.get("include") or {}, raw.get("exclude") or {}
    if not isinstance(include, dict) or not isinstance(exclude, dict):
        _fail("include y exclude tienen que ser objetos.")
    if set(include) - INCLUDE_KEYS or set(exclude) - EXCLUDE_KEYS:
        _fail("Hay un filtro que no existe.")

    inc = {}
    if include.get("year_from") is not None:
        inc["year_from"] = _int(include["year_from"], YEAR_MIN, YEAR_MAX, "year_from")
    if include.get("year_to") is not None:
        inc["year_to"] = _int(include["year_to"], YEAR_MIN, YEAR_MAX, "year_to")
    if "year_from" in inc and "year_to" in inc and inc["year_from"] > inc["year_to"]:
        _fail("year_from no puede ser mayor que year_to.")
    if include.get("duration_min") is not None:
        inc["duration_min"] = _int(include["duration_min"], 0, 3600, "duration_min")
    if include.get("duration_max") is not None:
        inc["duration_max"] = _int(include["duration_max"], 0, 3600, "duration_max")
    if "duration_min" in inc and "duration_max" in inc and inc["duration_min"] > inc["duration_max"]:
        _fail("duration_min no puede ser mayor que duration_max.")
    for key, cleaner in (("genres", lambda v: _words(v, "genres")), ("artists", lambda v: _ids(v, "artists", MAX_ARTISTS)), ("release_types", lambda v: _kinds(v, "release_types"))):
        if key in include:
            value = cleaner(include[key])
            if value:
                inc[key] = value

    exc = {}
    for key, cleaner in (("genres", lambda v: _words(v, "genres")), ("artists", lambda v: _ids(v, "artists", MAX_ARTISTS)), ("release_types", lambda v: _kinds(v, "release_types")), ("songs", lambda v: _ids(v, "songs", MAX_SONGS))):
        if key in exclude:
            value = cleaner(exclude[key])
            if value:
                exc[key] = value
    if "years" in exclude:
        ranges = []
        for pair in _list(exclude["years"], "years", MAX_RANGES):
            if not isinstance(pair, list) or len(pair) != 2:
                _fail("years: cada rango tiene que ser [desde, hasta].")
            low, high = _int(pair[0], YEAR_MIN, YEAR_MAX, "years"), _int(pair[1], YEAR_MIN, YEAR_MAX, "years")
            if low > high:
                _fail("years: el rango tiene el desde mayor que el hasta.")
            ranges.append([low, high])
        if ranges:
            exc["years"] = ranges
    return {"include": inc, "exclude": exc}


def _any_genre(genres):
    query = Q()
    for genre in genres:
        query |= Q(album__genre__iexact=genre)
    return query


def pool(filters):
    """The songs that can come up with these (already cleaned) filters."""
    songs = Song.objects.filter(hidden=False, deezer_id__isnull=False)
    inc, exc = filters["include"], filters["exclude"]
    if "year_from" in inc:
        songs = songs.filter(album__year__gte=inc["year_from"])
    if "year_to" in inc:
        songs = songs.filter(album__year__lte=inc["year_to"])
    if "genres" in inc:
        songs = songs.filter(_any_genre(inc["genres"]))
    if "artists" in inc:
        songs = songs.filter(album__artist_id__in=inc["artists"])
    if "release_types" in inc:
        songs = songs.filter(album__release_type__in=inc["release_types"])
    if "duration_min" in inc:
        songs = songs.filter(duration_seconds__gte=inc["duration_min"])
    if "duration_max" in inc:
        songs = songs.filter(duration_seconds__lte=inc["duration_max"])
    if "genres" in exc:
        songs = songs.exclude(_any_genre(exc["genres"]))
    if "artists" in exc:
        songs = songs.exclude(album__artist_id__in=exc["artists"])
    if "release_types" in exc:
        songs = songs.exclude(album__release_type__in=exc["release_types"])
    for low, high in exc.get("years", []):
        songs = songs.exclude(album__year__gte=low, album__year__lte=high)
    if "songs" in exc:
        songs = songs.exclude(pk__in=exc["songs"])
    return songs
