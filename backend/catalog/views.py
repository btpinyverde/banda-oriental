from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Song

# El catálogo cambia poco (solo cuando se corre una importación): unos minutos de caché alcanzan para que
# el buscador del juego no vuelva a pedirlo en cada visita.
CACHE_SECONDS = 300


def has_readable_title(song) -> bool:
    """Falso para títulos que son solo símbolos ("-", "...", "( )"): no se pueden buscar ni adivinar."""
    return any(char.isalnum() for char in song.title)


class SongListView(APIView):
    """Todas las canciones del catálogo, para el buscador del juego.

    No dice cuál es la canción del día: eso solo lo sabe `/api/daily/`, y nunca por este camino.
    """

    def get(self, request):
        songs = Song.objects.select_related("album__artist").order_by("album__artist__name", "title", "id")
        response = Response(
            {
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
        )
        response["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
        return response
