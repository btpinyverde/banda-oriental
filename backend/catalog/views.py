from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models import Count, Q

from .models import Album, Song

# El catálogo cambia poco (solo cuando se corre una importación): unos minutos de caché alcanzan para que
# el buscador del juego no vuelva a pedirlo en cada visita.
CACHE_SECONDS = 300
SONGS_CACHE_KEY = "songs-list"
ALBUMS_CACHE_KEY = "albums-list"


def has_readable_title(song) -> bool:
    """Falso para títulos que son solo símbolos ("-", "...", "( )"): no se pueden buscar ni adivinar."""
    return any(char.isalnum() for char in song.title)


class SongListView(APIView):
    """Todas las canciones del catálogo, para el buscador del juego.

    No dice cuál es la canción del día: eso solo lo sabe `/api/daily/`, y nunca por este camino.

    Armarla cuesta (miles de filas) y cualquiera puede pedirla: el resultado se guarda unos minutos en el servidor, así
    que repetir el pedido no vuelve a tocar la base. Además de la caché de los navegadores (Cache-Control).
    """

    throttle_scope = "songs"

    def get(self, request):
        payload = cache.get(SONGS_CACHE_KEY)
        if payload is None:
            songs = (
                Song.objects.filter(hidden=False)
                .select_related("album__artist")
                .order_by("album__artist__name", "title", "id")
            )
            payload = {
                "songs": [
                    {
                        "id": song.id,
                        "title": song.title,
                        "artist": song.album.artist.name,
                        "album": song.album.name,
                        "year": song.album.year,
                        "genre": song.album.genre,
                    }
                    for song in songs
                    if has_readable_title(song)
                ]
            }
            cache.set(SONGS_CACHE_KEY, payload, CACHE_SECONDS)
        response = Response(payload)
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
