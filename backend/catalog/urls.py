from django.urls import path

from .views import SongListView

app_name = "catalog"

urlpatterns = [
    path("songs/", SongListView.as_view(), name="song-list"),
]
