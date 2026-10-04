from django.db import models


class Artist(models.Model):
    mbid = models.CharField(max_length=36, unique=True)
    name = models.CharField(max_length=255)
    instagram_handle = models.CharField(max_length=255, blank=True)
    # Perfil de Deezer con el que se emparejó (por nombre exacto). Vacío = todavía sin emparejar.
    deezer_id = models.PositiveBigIntegerField(null=True, blank=True, unique=True)
    # Cuándo se buscó en Deezer por última vez; con `deezer_id` vacío significa "no se encontró".
    deezer_checked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name


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

    def __str__(self):
        return self.title


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
