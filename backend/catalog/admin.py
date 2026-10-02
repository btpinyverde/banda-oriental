from django.contrib import admin, messages
from django.core.management import call_command

from .models import Album, Artist, Song, SyncState


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


@admin.register(SyncState)
class SyncStateAdmin(admin.ModelAdmin):
    # A data migration (0002) guarantees this row exists from the first
    # migrate, so the action below is always selectable — even on a fresh
    # DB with zero Artists, which is exactly when you need to trigger the
    # very first sync. It ignores the selection and the row's own fields
    # on purpose: there's only ever one row, and its only job is to carry
    # this action and show the current offset.
    list_display = ("musicbrainz_offset",)
    actions = [sync_with_musicbrainz]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


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
