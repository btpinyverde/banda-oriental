"""The music archive API: search and browse artists, albums and songs. Public and read-only.

It answers with what the catalog has, and only that: it never says which song is the one of today (or a day yet to
come); `played_on` lists days that are already over.
"""

from django.core.paginator import Paginator
from django.http import HttpResponse
from django.db.models import Case, CharField, Count, F, IntegerField, Max, Min, OuterRef, Q, Subquery, Value, When
from django.utils import timezone
from rest_framework.exceptions import NotFound, ParseError
from rest_framework.response import Response
from rest_framework.views import APIView

from gameplay.models import DailySong

from .models import Album, Artist, FeaturedArtist, Song
from .search import Unaccent, filter_by_text, strip_accents

CACHE_SECONDS = 60
MAX_QUERY_LENGTH = 100
DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE = 20, 50
DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT = 5, 20
# A title with no letter or digit at all ("-", "...") cannot be searched or guessed: not for the archive either.
READABLE = Q(title__regex=r"\w") & Q(hidden=False)
READABLE_SONG = Q(songs__title__regex=r"\w") & Q(songs__hidden=False)


# ---------- Reading what was asked ----------


def _int(request, name, *, default=None, minimum=None, maximum=None):
    raw = request.query_params.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ParseError(f"{name} tiene que ser un número.") from None
    if (minimum is not None and value < minimum) or (maximum is not None and value > maximum):
        raise ParseError(f"{name} tiene que estar entre {minimum} y {maximum}.")
    return value


def _text(request, name="q", *, required=False):
    value = " ".join(request.query_params.get(name, "").split())
    if required and not value:
        raise ParseError("Escribí algo para buscar.")
    if len(value) > MAX_QUERY_LENGTH:
        raise ParseError(f"La búsqueda es demasiado larga (máximo {MAX_QUERY_LENGTH} caracteres).")
    return value


def _page(request, queryset, row):
    size = _int(request, "page_size", default=DEFAULT_PAGE_SIZE, minimum=1, maximum=MAX_PAGE_SIZE)
    number = _int(request, "page", default=1, minimum=1)
    paginator = Paginator(queryset, size)
    results = [] if number > paginator.num_pages else [row(item) for item in paginator.page(number)]
    return {"count": paginator.count, "page": number, "pages": paginator.num_pages, "results": results}


def _answer(payload):
    response = Response(payload)
    response["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
    return response


# ---------- Shapes ----------


def _artist_ref(artist):
    return {"id": artist.id, "name": artist.name}


def _song_row(song, played_on=None):
    album = song.album
    return {
        "id": song.id,
        "title": song.title,
        "duration_seconds": song.duration_seconds,
        "artist": _artist_ref(album.artist),
        "album": {"id": album.id, "name": album.name, "year": album.year, "genre": album.genre, "cover_art_url": album.cover_art_url},
        "played_on": played_on,
    }


def _album_row(album):
    return {
        "id": album.id,
        "name": album.name,
        "artist": _artist_ref(album.artist),
        "year": album.year,
        "genre": album.genre,
        "release_type": album.release_type,
        "songs": album.songs_count,
        "cover_art_url": album.cover_art_url,
    }


def _artist_row(artist):
    return {
        "id": artist.id,
        "name": artist.name,
        "albums": artist.albums_count,
        "songs": artist.songs_count,
        "first_year": artist.first_year,
        "last_year": artist.last_year,
        "cover_art_url": artist.cover or "",
        "picture_url": artist.picture_url,
    }


# ---------- Querysets ----------


_READABLE_ARTIST_SONG = Q(albums__songs__title__regex=r"\w") & Q(albums__songs__hidden=False)


def songs_queryset():
    return Song.objects.filter(READABLE).select_related("album__artist")


def albums_queryset():
    return (
        Album.objects.select_related("artist")
        .annotate(songs_count=Count("songs", filter=READABLE_SONG, distinct=True))
        .filter(songs_count__gt=0)
    )


def artists_queryset():
    return (
        Artist.objects.annotate(
            songs_count=Count("albums__songs", filter=_READABLE_ARTIST_SONG, distinct=True),
            albums_count=Count("albums", filter=_READABLE_ARTIST_SONG, distinct=True),
            first_year=Min("albums__year"),
            last_year=Max("albums__year"),
            # The cover of its latest record that has one (a newer record without cover does not hide an older one that has it).
            cover=Subquery(
                Album.objects.filter(artist=OuterRef("pk"))
                .exclude(cover_art_url="")
                .order_by(F("year").desc(nulls_last=True), "-id")
                .values("cover_art_url")[:1],
                output_field=CharField(),
            ),
        )
        .filter(songs_count__gt=0)
    )


def _best_first(queryset, text, field):
    """Orders a search: the exact name first, then the ones that start with it, then the rest."""
    plain = strip_accents(text)
    return (
        queryset.annotate(_main=Unaccent(field))
        .annotate(
            _rank=Case(
                When(_main__iexact=plain, then=Value(0)),
                When(_main__istartswith=plain, then=Value(1)),
                default=Value(2),
                output_field=IntegerField(),
            )
        )
        .order_by("_rank", "_main", "id")
    )


def _past_days(song_ids):
    """song id -> the days (already over, published) it was the song of the day, oldest first."""
    days = {}
    rows = DailySong.objects.filter(
        song_id__in=song_ids, state=DailySong.PUBLISHED, date__lt=timezone.localdate()
    ).order_by("date")
    for song_id, day in rows.values_list("song_id", "date"):
        days.setdefault(song_id, []).append(str(day))
    return days


# ---------- Views ----------


class ArchiveView(APIView):
    throttle_scope = "catalog"
    http_method_names = ["get", "head", "options"]


class SearchView(ArchiveView):
    """One search box for everything: a few artists, albums and songs, each group with how many matched in total."""

    def get(self, request):
        text = _text(request, required=True)
        limit = _int(request, "limit", default=DEFAULT_SEARCH_LIMIT, minimum=1, maximum=MAX_SEARCH_LIMIT)
        artists = _best_first(filter_by_text(artists_queryset(), text, ["name"]), text, "name")
        albums = _best_first(filter_by_text(albums_queryset(), text, ["name", "artist__name"]), text, "name")
        songs = _best_first(
            filter_by_text(songs_queryset(), text, ["title", "album__name", "album__artist__name"]), text, "title"
        )
        return _answer(
            {
                "q": text,
                "artists": {"results": [_artist_row(a) for a in artists[:limit]], "total": artists.count()},
                "albums": {"results": [_album_row(a) for a in albums[:limit]], "total": albums.count()},
                "songs": {"results": [_song_row(s) for s in songs[:limit]], "total": songs.count()},
            }
        )


def _decade_range(request):
    decade = _int(request, "decade", minimum=1000, maximum=2999)
    return (decade, decade + 9) if decade is not None else None


class ArtistListView(ArchiveView):
    def get(self, request):
        text = _text(request)
        sort = request.query_params.get("sort", "name")
        if sort not in ("name", "songs"):
            raise ParseError("sort tiene que ser name o songs.")
        letter = request.query_params.get("letter", "").strip()
        if letter and not (len(letter) == 1 and letter.isalpha()):
            raise ParseError("letter tiene que ser una sola letra.")
        artists = artists_queryset()
        if text:
            artists = _best_first(filter_by_text(artists, text, ["name"]), text, "name")
        elif sort == "songs":
            artists = artists.annotate(_main=Unaccent("name")).order_by("-songs_count", "_main", "id")
        else:
            artists = artists.annotate(_main=Unaccent("name")).order_by("_main", "id")
        if letter:
            artists = artists.annotate(_letter=Unaccent("name")).filter(_letter__istartswith=strip_accents(letter))
        return _answer(_page(request, artists, _artist_row))


class ArtistDetailView(ArchiveView):
    def get(self, request, pk):
        artist = artists_queryset().filter(pk=pk).first()
        if artist is None:
            raise NotFound("No encontramos a ese artista.")
        albums = albums_queryset().filter(artist=artist).order_by(F("year").asc(nulls_last=True), "name", "id")
        return _answer({**_artist_row(artist), "albums": [_album_row(a) for a in albums]})


class AlbumListView(ArchiveView):
    SORTS = {"name": ["name", "id"], "year": [F("year").asc(nulls_last=True), "name", "id"]}

    def get(self, request):
        text = _text(request)
        sort = request.query_params.get("sort", "name")
        if sort not in self.SORTS:
            raise ParseError("sort tiene que ser name o year.")
        albums = albums_queryset()
        year = _int(request, "year")
        if year is not None:
            albums = albums.filter(year=year)
        decade = _decade_range(request)
        if decade:
            albums = albums.filter(year__range=decade)
        artist = _int(request, "artist")
        if artist is not None:
            albums = albums.filter(artist_id=artist)
        genre = request.query_params.get("genre", "").strip()
        if genre:
            albums = albums.filter(genre__iexact=genre)
        if text:
            albums = _best_first(filter_by_text(albums, text, ["name", "artist__name"]), text, "name")
        else:
            albums = albums.order_by(*self.SORTS[sort])
        return _answer(_page(request, albums, _album_row))


class AlbumDetailView(ArchiveView):
    def get(self, request, pk):
        album = albums_queryset().filter(pk=pk).first()
        if album is None:
            raise NotFound("No encontramos ese disco.")
        songs = Song.objects.filter(READABLE, album=album).order_by("id")
        return _answer(
            {
                **_album_row(album),
                "songs": [{"id": s.id, "title": s.title, "duration_seconds": s.duration_seconds} for s in songs],
            }
        )


class SongListView(ArchiveView):
    # newest / oldest: by the year of the record, the ones with no year last in both.
    SORTS = {
        "title": ["title", "id"],
        "artist": ["album__artist__name", "title", "id"],
        "newest": [F("album__year").desc(nulls_last=True), "title", "id"],
        "oldest": [F("album__year").asc(nulls_last=True), "title", "id"],
    }

    def get(self, request):
        text = _text(request)
        sort = request.query_params.get("sort", "title")
        if sort not in self.SORTS:
            raise ParseError("sort tiene que ser title, artist, newest u oldest.")
        songs = songs_queryset()
        for param, field in (("artist", "album__artist_id"), ("album", "album_id"), ("year", "album__year")):
            value = _int(request, param)
            if value is not None:
                songs = songs.filter(**{field: value})
        decade = _decade_range(request)
        if decade:
            songs = songs.filter(album__year__range=decade)
        genre = request.query_params.get("genre", "").strip()
        if genre:
            songs = songs.filter(album__genre__iexact=genre)
        if text:
            songs = _best_first(
                filter_by_text(songs, text, ["title", "album__name", "album__artist__name"]), text, "title"
            )
        else:
            songs = songs.order_by(*self.SORTS[sort])
        page = _page(request, songs, lambda song: song)
        days = _past_days([song.id for song in page["results"]])
        page["results"] = [_song_row(song, (days.get(song.id) or [None])[-1]) for song in page["results"]]
        return _answer(page)


class SongDetailView(ArchiveView):
    def get(self, request, pk):
        song = songs_queryset().filter(pk=pk).first()
        if song is None:
            raise NotFound("No encontramos esa canción.")
        row = _song_row(song)
        del row["played_on"]
        return _answer({**row, "played_on": _past_days([song.id]).get(song.id, [])})


class FiltersView(ArchiveView):
    """What the interface can filter by (decades, genres, range of years), each with how many albums it has."""

    def get(self, request):
        years, genres = {}, {}
        for year, genre in albums_queryset().values_list("year", "genre"):
            if year:
                years[year] = years.get(year, 0) + 1
            if genre:
                genres[genre] = genres.get(genre, 0) + 1
        decades = {}
        for year, count in years.items():
            decades[year // 10 * 10] = decades.get(year // 10 * 10, 0) + count
        return _answer(
            {
                "decades": [{"decade": d, "albums": n} for d, n in sorted(decades.items())],
                "genres": [{"genre": g, "albums": n} for g, n in sorted(genres.items(), key=lambda item: (-item[1], item[0]))],
                "years": {"min": min(years) if years else None, "max": max(years) if years else None},
            }
        )


class FeaturedListView(ArchiveView):
    """The artists of the landing, in the order set in the admin. Same shape as an artist row, plus `photo_url`."""

    def get(self, request):
        featured = {f.artist_id: f for f in FeaturedArtist.objects.filter(active=True)}
        artists = {a.id: a for a in artists_queryset().filter(pk__in=featured)}
        rows = []
        for item in sorted(featured.values(), key=lambda f: (f.position, f.id)):
            artist = artists.get(item.artist_id)  # an artist with no readable songs stays out
            if artist:
                photo = f"/api/catalog/featured/{artist.id}/image/?v={int(item.updated_at.timestamp())}"
                rows.append({**_artist_row(artist), "photo_url": photo})
        return _answer({"results": rows})


class FeaturedImageView(ArchiveView):
    def get(self, request, pk):
        item = FeaturedArtist.objects.filter(artist_id=pk, active=True).first()
        if not item:
            raise NotFound()
        # The link carries the update time (`?v=`), so it can be cached for a day: a new photo is a new link.
        response = HttpResponse(bytes(item.image), content_type=item.image_type)
        response["Cache-Control"] = "public, max-age=86400"
        response["X-Content-Type-Options"] = "nosniff"
        return response
