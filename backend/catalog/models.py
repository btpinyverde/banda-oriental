from django.db import models


class Artist(models.Model):
    mbid = models.CharField(max_length=36, unique=True)
    name = models.CharField(max_length=255)
    instagram_handle = models.CharField(max_length=255, blank=True)
    # Perfil de Deezer con el que se emparejó (por nombre exacto). Vacío = todavía sin emparejar.
    deezer_id = models.PositiveBigIntegerField(null=True, blank=True, unique=True)
    # Cuándo se buscó en Deezer por última vez; con `deezer_id` vacío significa "no se encontró".
    deezer_checked_at = models.DateTimeField(null=True, blank=True)
    # La foto del artista, de Deezer (https). Vacía si no tiene o todavía no se buscó: nunca se inventa una.
    picture_url = models.URLField(max_length=300, blank=True)
    # ¿Hay algo más que el nombre que respalde ese perfil de Deezer? "verificado" (MusicBrainz o Wikidata apuntan al mismo perfil,
    # los discos coinciden o se confirmó a mano), "sin_verificar" (nadie lo respalda) o "equivocado" (apuntan a otro perfil).
    # Vacío = todavía no se revisó. Lo que solo trae Deezer de un perfil sin verificar queda en cuarentena (oculto).
    deezer_status = models.CharField(max_length=15, blank=True, db_index=True)
    # Quién lo respaldó: "musicbrainz", "wikidata", "discos" o "manual".
    deezer_source = models.CharField(max_length=15, blank=True)
    # Si se detectó que el perfil es otro, el que MusicBrainz o Wikidata dicen que es el verdadero.
    deezer_suggested_id = models.PositiveBigIntegerField(null=True, blank=True)
    # Cuándo se buscó su foto en Deezer por última vez (para no volver a pedir la de quien no tiene).
    picture_checked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name


class FeaturedArtist(models.Model):
    """An artist the landing shows, with a cutout photo uploaded from the admin. The photo lives in the database (a few
    small files, cached for a day by the image view): the R2 bucket is private, so its links expire."""

    artist = models.OneToOneField(Artist, on_delete=models.CASCADE, related_name="featured")
    image = models.BinaryField()
    image_type = models.CharField(max_length=20)
    position = models.PositiveIntegerField(default=0, help_text="Menor número = aparece primero.")
    active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "id"]
        verbose_name = "artista destacado"
        verbose_name_plural = "artistas destacados"

    def __str__(self):
        return self.artist.name


class Album(models.Model):
    RELEASE_TYPES = [("album", "Álbum"), ("ep", "EP"), ("single", "Single")]

    # Null (no vacío) cuando el disco solo existe en Deezer: el null permite varios sin MBID.
    mbid = models.CharField(max_length=36, unique=True, null=True, blank=True)
    deezer_id = models.PositiveBigIntegerField(null=True, blank=True, unique=True)
    release_type = models.CharField(max_length=10, choices=RELEASE_TYPES, default="album")
    name = models.CharField(max_length=255)
    artist = models.ForeignKey(Artist, on_delete=models.CASCADE, related_name="albums")
    year = models.IntegerField(null=True, blank=True)
    genre = models.CharField(max_length=100, blank=True)
    cover_art_url = models.URLField(blank=True)

    def __str__(self):
        return self.name


class Song(models.Model):
    mbid = models.CharField(max_length=36, unique=True, null=True, blank=True)
    deezer_id = models.PositiveBigIntegerField(null=True, blank=True, unique=True)
    title = models.CharField(max_length=255)
    album = models.ForeignKey(Album, on_delete=models.CASCADE, related_name="songs")
    duration_seconds = models.IntegerField(null=True, blank=True)
    # Out of the game and the archive without deleting anything (a duplicate, classical music...). Reversible, and the
    # importers still find the song by its ids, so running them again does not bring it back as a new one.
    hidden = models.BooleanField(default=False, db_index=True)
    # Why: "duplicate" or "classical" when `clean_catalog` hid it (so it can undo exactly that); empty if hidden by hand.
    hidden_reason = models.CharField(max_length=20, blank=True)

    def __str__(self):
        """Enough to tell apart songs that share a title: who, which record, which year, how long. The admin picker
        shows exactly this."""
        record = self.album.name + (f" ({self.album.year})" if self.album.year else "")
        text = f"{self.title} — {self.album.artist.name} · {record}"
        if self.duration_seconds:
            text += f" · {self.duration_seconds // 60}:{self.duration_seconds % 60:02d}"
        return text


class SyncState(models.Model):
    """Singleton (always pk=1): remembers where the last sync left off in
    MusicBrainz's artist search results, so a bounded admin-triggered sync
    makes forward progress across multiple clicks instead of re-processing
    the same first page every time."""

    musicbrainz_offset = models.PositiveIntegerField(default=0)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class Submission(models.Model):
    """What visitors send from the archive: a mistake they found, a band asking to be added, or a message. The admin reads them."""

    KINDS = [("error", "Algo está mal"), ("alta", "Quiere sumarse"), ("contacto", "Mensaje")]
    TARGETS = [("artist", "Artista"), ("album", "Disco"), ("song", "Canción")]
    STATUSES = [("nuevo", "Nuevo"), ("visto", "Visto"), ("resuelto", "Resuelto"), ("descartado", "Descartado")]

    kind = models.CharField(max_length=10, choices=KINDS)
    target_type = models.CharField(max_length=10, choices=TARGETS, blank=True)
    target_id = models.PositiveIntegerField(null=True, blank=True)
    # The name of what was reported, from our own database when it exists (never trusted from the visitor).
    target_label = models.CharField(max_length=200, blank=True)
    name = models.CharField(max_length=120, blank=True)
    contact = models.CharField(max_length=200, blank=True)
    links = models.CharField(max_length=500, blank=True)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=STATUSES, default="nuevo", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "reporte o pedido"
        verbose_name_plural = "reportes y pedidos"

    def __str__(self):
        return f"{self.get_kind_display()}: {self.target_label or self.name or self.message[:40]}"
