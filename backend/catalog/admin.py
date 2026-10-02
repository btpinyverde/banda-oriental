from django.contrib import admin, messages
from django.core.management import call_command

from .models import Album, Artist, Song


@admin.action(description="Sincronizar con MusicBrainz (próximos 5 artistas)")
def sync_with_musicbrainz(modeladmin, request, queryset):
    try:
        call_command("sync_musicbrainz")
    except Exception as exc:  # pragma: no cover - surfaced to the admin, not hidden
        modeladmin.message_user(
            request, f"Error al sincronizar: {exc}", level=messages.ERROR
        )
        return
    modeladmin.message_user(
        request, "Sincronización completa.", level=messages.SUCCESS
    )


@admin.register(Artist)
class ArtistAdmin(admin.ModelAdmin):
    list_display = ("name", "mbid", "instagram_handle")
    search_fields = ("name",)
    actions = [sync_with_musicbrainz]


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ("name", "artist", "year", "genre")
    list_filter = ("year",)
    search_fields = ("name",)


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ("title", "album", "duration_seconds")
    search_fields = ("title",)
