import io

from django import forms
from django.contrib import admin, messages
from django.core.management import call_command
from django.db.models import Count, Q
from django.http import Http404, HttpResponse
from django.urls import path, reverse
from django.utils.html import format_html
from PIL import Image, UnidentifiedImageError

from . import verification
from .models import Album, Artist, FeaturedArtist, Song, Submission, SubmissionImage, SyncState
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
    list_display = ("name", "mbid", "instagram_handle", "deezer_status", "deezer_source")
    list_filter = ("deezer_status", "deezer_source")
    search_fields = ("name",)
    actions = ["confirmar_emparejado", "marcar_equivocado"]

    @admin.action(description="Confirmar a mano el perfil de Deezer (vuelve a mostrar lo que estaba en cuarentena)")
    def confirmar_emparejado(self, request, queryset):
        ids = list(queryset.filter(deezer_id__isnull=False).values_list("pk", flat=True))
        Artist.objects.filter(pk__in=ids).update(deezer_status=verification.VERIFIED, deezer_source="manual", deezer_suggested_id=None)
        back = verification.restore_quarantine(Artist.objects.filter(pk__in=ids))
        self.message_user(request, f"{len(ids)} artistas confirmados; {back} canciones vuelven a mostrarse.", level=messages.SUCCESS)

    @admin.action(description="Marcar el perfil de Deezer como equivocado (oculta lo que solo trae Deezer)")
    def marcar_equivocado(self, request, queryset):
        ids = list(queryset.filter(deezer_id__isnull=False).values_list("pk", flat=True))
        Artist.objects.filter(pk__in=ids).update(deezer_status=verification.WRONG, deezer_source="manual")
        hidden = verification.hide_unverified(Artist.objects.filter(pk__in=ids))
        self.message_user(request, f"{len(ids)} artistas marcados; {hidden} canciones ocultas.", level=messages.SUCCESS)


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ("name", "artist", "year", "genre")
    list_filter = ("year",)
    search_fields = ("name",)


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    """Also what the day form searches in (autocomplete): the title alone is not enough to choose, so it finds by title,
    artist or record in any order and accent ("luna negra drexler vaiven"), and shows who/record/year/length."""

    list_display = ("title", "artist_name", "album", "year", "duration", "times_used", "hidden")
    list_filter = ("hidden", "hidden_reason")
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


MAX_PHOTO_BYTES = 8 * 1024 * 1024
# The card shows the photo at about 300 px; this is enough for a 2x screen. A bigger upload is shrunk, never enlarged.
PHOTO_MAX_SIDE = 900
PHOTO_TYPES = {"PNG", "WEBP"}


class FeaturedArtistForm(forms.ModelForm):
    """The photo is uploaded as a file and kept as bytes. Only PNG and WEBP (the cutout needs transparency), checked by
    what the bytes really are, not by the name or the type the browser says."""

    photo = forms.FileField(
        required=False,
        label="Foto recortada",
        help_text="PNG o WEBP con fondo transparente, hasta 8 MB. Se achica y se comprime sola. El color de fondo lo pone la tarjeta.",
    )

    class Meta:
        model = FeaturedArtist
        fields = ("artist", "position", "active")

    def clean_photo(self):
        photo = self.cleaned_data.get("photo")
        if not photo:
            if not self.instance.pk:
                raise forms.ValidationError("Subí la foto del artista.")
            return None
        if photo.size > MAX_PHOTO_BYTES:
            raise forms.ValidationError("La foto pesa más de 8 MB.")
        try:
            image = Image.open(io.BytesIO(photo.read()))
            if image.format not in PHOTO_TYPES:
                raise forms.ValidationError("Tiene que ser PNG o WEBP.")
            image = image.convert("RGBA")
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise forms.ValidationError("El archivo no es una imagen.") from None
        image.thumbnail((PHOTO_MAX_SIDE, PHOTO_MAX_SIDE))  # keeps the proportion, never enlarges
        out = io.BytesIO()
        image.save(out, "WEBP", quality=88, method=6)
        self.cleaned_data["_data"], self.cleaned_data["_type"] = out.getvalue(), "image/webp"
        return photo

    def save(self, commit=True):
        item = super().save(commit=False)
        if self.cleaned_data.get("photo"):
            item.image, item.image_type = self.cleaned_data["_data"], self.cleaned_data["_type"]
        if commit:
            item.save()
        return item


@admin.register(FeaturedArtist)
class FeaturedArtistAdmin(admin.ModelAdmin):
    form = FeaturedArtistForm
    list_display = ("artist", "position", "active", "preview")
    list_editable = ("position", "active")
    autocomplete_fields = ("artist",)

    @admin.display(description="Foto")
    def preview(self, obj):
        return format_html('<img src="/api/catalog/featured/{}/image/?v={}" height="48" alt="">', obj.artist_id, int(obj.updated_at.timestamp()))


class SubmissionImageInline(admin.TabularInline):
    """The pictures a visitor attached, shown inside the message (only staff can open them)."""

    model = SubmissionImage
    extra = 0
    can_delete = False
    fields = ("preview",)
    readonly_fields = ("preview",)

    def has_add_permission(self, request, obj=None):
        return False

    @admin.display(description="Imagen")
    def preview(self, obj):
        url = reverse("admin:catalog_submission_imagen", args=[obj.pk])
        return format_html('<a href="{0}" target="_blank" rel="noopener"><img src="{0}" alt="" style="max-height:200px;max-width:100%"></a>', url)


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    """What visitors send from the archive. Only the status is editable: what they wrote stays as it came."""

    list_display = ("created_at", "kind", "reason", "target_label", "name", "contact", "status", "notified_at")
    list_filter = ("status", "kind", "target_type")
    search_fields = ("target_label", "name", "contact", "message")
    readonly_fields = ("kind", "target_type", "target_id", "target_label", "name", "contact", "links", "reason", "message", "created_at", "notified_at")
    actions = ["marcar_visto", "marcar_resuelto"]
    inlines = [SubmissionImageInline]

    def has_add_permission(self, request):
        return False

    def get_urls(self):
        extra = [path("imagen/<int:pk>/", self.admin_site.admin_view(self.imagen), name="catalog_submission_imagen")]
        return extra + super().get_urls()

    def imagen(self, request, pk):
        image = SubmissionImage.objects.filter(pk=pk).first()
        if not image:
            raise Http404
        response = HttpResponse(bytes(image.data), content_type=image.content_type)
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "default-src 'none'; img-src 'self'"  # it is only ever shown as a picture
        response["Cache-Control"] = "private, max-age=3600"
        return response

    @admin.action(description="Marcar como visto")
    def marcar_visto(self, request, queryset):
        queryset.update(status="visto")

    @admin.action(description="Marcar como resuelto")
    def marcar_resuelto(self, request, queryset):
        queryset.update(status="resuelto")
