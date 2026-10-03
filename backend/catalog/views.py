from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Song


class SongListView(APIView):
    def get(self, request):
        songs = Song.objects.select_related("album__artist").order_by("title", "id")
        return Response(
            {
                "songs": [
                    {"id": song.id, "title": song.title, "artist": song.album.artist.name}
                    for song in songs
                ]
            }
        )
