from django.urls import path

from .views import AlbumListView, SongListView

app_name = "catalog"

urlpatterns = [
    path("songs/", SongListView.as_view(), name="songs"),
    path("albums/", AlbumListView.as_view(), name="albums"),
]
