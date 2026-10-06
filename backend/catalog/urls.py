from django.urls import path

from . import archive
from .views import AlbumListView, SongListView

app_name = "catalog"

urlpatterns = [
    path("songs/", SongListView.as_view(), name="songs"),
    path("albums/", AlbumListView.as_view(), name="albums"),
    # The music archive: search and browse artists, albums and songs (docs/contrato-api-archivo.md).
    path("catalog/featured/", archive.FeaturedListView.as_view(), name="archive-featured"),
    path("catalog/featured/<int:pk>/image/", archive.FeaturedImageView.as_view(), name="archive-featured-image"),
    path("catalog/search/", archive.SearchView.as_view(), name="archive-search"),
    path("catalog/filters/", archive.FiltersView.as_view(), name="archive-filters"),
    path("catalog/artists/", archive.ArtistListView.as_view(), name="archive-artists"),
    path("catalog/artists/<int:pk>/", archive.ArtistDetailView.as_view(), name="archive-artist"),
    path("catalog/albums/", archive.AlbumListView.as_view(), name="archive-albums"),
    path("catalog/albums/<int:pk>/", archive.AlbumDetailView.as_view(), name="archive-album"),
    path("catalog/songs/", archive.SongListView.as_view(), name="archive-songs"),
    path("catalog/songs/<int:pk>/", archive.SongDetailView.as_view(), name="archive-song"),
]
