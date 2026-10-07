import gzip
import json
import threading

from django.core.cache import cache
from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models import Count, Q

from .models import Album, Song

# El catálogo cambia poco (solo cuando se corre una importación): unos minutos de caché alcanzan para que
# el buscador del juego no vuelva a pedirlo en cada visita.
CACHE_SECONDS = 300
SONGS_CACHE_KEY = "songs-list"
ALBUMS_CACHE_KEY = "albums-list"


def is_readable_title(title: str) -> bool:
    """Falso para títulos que son solo símbolos ("-", "...", "( )"): no se pueden buscar ni adivinar."""
    return any(char.isalnum() for char in title)


def has_readable_title(song) -> bool:
    return is_readable_title(song.title)


_songs_build_lock = threading.Lock()


def _build_songs_gzip() -> bytes:
    """El JSON de todas las canciones, ya comprimido. Pesa varios MB con un catálogo de decenas de miles de canciones, así que se arma
    sin objetos del ORM (una consulta de valores, una fila a la vez al armar el texto) para no llevar al servidor al límite de
    memoria, y se guarda comprimido (unas diez veces menos) para guardarlo y para mandarlo."""
    rows = (
        Song.objects.filter(hidden=False)
        .order_by("album__artist__name", "title", "id")
        .values_list("id", "title", "album__artist__name", "album__name", "album__year", "album__genre")
    )
    parts = [
        json.dumps({"id": i, "title": t, "artist": a, "album": al, "year": y, "genre": g}, ensure_ascii=False, separators=(",", ":"))
        for i, t, a, al, y, g in rows
        if is_readable_title(t)
    ]
    body = ('{"songs":[' + ",".join(parts) + "]}").encode("utf-8")
    del parts
    return gzip.compress(body, compresslevel=6)


class SongListView(APIView):
    """Todas las canciones del catálogo, para el buscador del juego.

    No dice cuál es la canción del día: eso solo lo sabe `/api/daily/`, y nunca por este camino.

    Armarla cuesta (decenas de miles de filas) y cualquiera puede pedirla: el resultado se guarda unos minutos en el servidor, ya
    comprimido, así que repetir el pedido no vuelve a tocar la base. Se manda comprimido (gzip) a quien lo acepta, que son todos los
    navegadores; a los demás, como JSON común. Además de la caché de los navegadores (Cache-Control).
    """

    throttle_scope = "songs"

    def get(self, request):
        packed = cache.get(SONGS_CACHE_KEY)
        if packed is None:
            # Un solo armado a la vez: si varias visitas nuevas llegan juntas, esperan y reusan el resultado (armarlo varias
            # veces al mismo tiempo multiplicaría la memoria que usa).
            with _songs_build_lock:
                packed = cache.get(SONGS_CACHE_KEY)
                if packed is None:
                    packed = _build_songs_gzip()
                    cache.set(SONGS_CACHE_KEY, packed, CACHE_SECONDS)
        accepts_gzip = "gzip" in request.headers.get("Accept-Encoding", "").lower()
        response = HttpResponse(packed if accepts_gzip else gzip.decompress(packed), content_type="application/json")
        if accepts_gzip:
            response["Content-Encoding"] = "gzip"
        response["Vary"] = "Accept-Encoding"
        response["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
        return response


class AlbumListView(APIView):
    """El catálogo juntado por disco (artista, disco, año, género y cuántas canciones tiene), para las páginas que lo
    exploran (artistas, épocas, géneros). Pesa mucho menos que la lista de todas las canciones, así que entra siempre
    en la caché del sitio por grande que sea el catálogo. Tampoco dice cuál es la canción del día.

    Igual que la lista de canciones, se guarda unos minutos en el servidor y se olvida cuando algo cambia de a uno.
    """

    throttle_scope = "songs"

    def get(self, request):
        payload = cache.get(ALBUMS_CACHE_KEY)
        if payload is None:
            albums = (
                Album.objects.select_related("artist")
                .annotate(songs_count=Count("songs", filter=Q(songs__hidden=False)))
                .filter(songs_count__gt=0)
                .order_by("artist__name", "year", "name", "id")
            )
            payload = {
                "albums": [
                    {
                        "artist": album.artist.name,
                        "album": album.name,
                        "year": album.year,
                        "genre": album.genre,
                        "songs": album.songs_count,
                    }
                    for album in albums
                ]
            }
            cache.set(ALBUMS_CACHE_KEY, payload, CACHE_SECONDS)
        response = Response(payload)
        response["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
        return response
