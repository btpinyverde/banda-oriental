from django.contrib import admin, messages
from django.core.management import call_command
from django.db.models import Count, Q

from .models import Album, Artist, Song, SyncState
from .search import Unaccent, strip_accents, unaccent_available


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
    """Also what the day form searches in (autocomplete): the title alone is not enough to choose, so it finds by title,
    artist or record in any order and accent ("luna negra drexler vaiven"), and shows who/record/year/length."""

    list_display = ("title", "artist_name", "album", "year", "duration", "times_used")
    list_select_related = ("album__artist",)
    search_fields = ("title", "album__name", "album__artist__name")
    ordering = ("title", "album__artist__name", "album__year", "id")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("album__artist").annotate(_times_used=Count("daily_appearances"))

    def get_search_results(self, request, queryset, search_term):
        terms = search_term.split()
        if not terms:
            return queryset, False
        if not unaccent_available():
            return super().get_search_results(request, queryset, search_term)
        queryset = queryset.annotate(
            _title=Unaccent("title"), _record=Unaccent("album__name"), _artist=Unaccent("album__artist__name")
        )
        for term in terms:  # every word has to be somewhere: title, record or artist
            plain = strip_accents(term)
            queryset = queryset.filter(
                Q(_title__icontains=plain) | Q(_record__icontains=plain) | Q(_artist__icontains=plain)
            )
        return queryset, False

    @admin.display(description="Artista", ordering="album__artist__name")
    def artist_name(self, song):
        return song.album.artist.name

    @admin.display(description="Año", ordering="album__year")
    def year(self, song):
        return song.album.year

    @admin.display(description="Duración")
    def duration(self, song):
        seconds = song.duration_seconds
        return f"{seconds // 60}:{seconds % 60:02d}" if seconds else "—"

    @admin.display(description="Veces usada", ordering="_times_used")
    def times_used(self, song):
        return song._times_used
