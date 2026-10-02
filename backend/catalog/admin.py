from django.contrib import admin

from .models import Album, Artist, Song


@admin.register(Artist)
class ArtistAdmin(admin.ModelAdmin):
    list_display = ("name", "mbid", "instagram_handle")
    search_fields = ("name",)


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ("name", "artist", "year", "genre")
    list_filter = ("year",)
    search_fields = ("name",)


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ("title", "album", "duration_seconds")
    search_fields = ("title",)
