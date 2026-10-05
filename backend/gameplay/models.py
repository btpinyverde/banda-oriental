import uuid

import logging

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import storages
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models.functions import Lower

from catalog.models import Song

from . import audio, jobs

logger = logging.getLogger(__name__)


class DailySong(models.Model):
    DRAFT = "draft"
    PUBLISHED = "published"
    STATE_CHOICES = [(DRAFT, "Borrador"), (PUBLISHED, "Publicado")]

    date = models.DateField(unique=True)
    song = models.ForeignKey(Song, on_delete=models.PROTECT, related_name="daily_appearances")
    state = models.CharField(max_length=10, choices=STATE_CHOICES, default=DRAFT)

    def __str__(self):
        return f"{self.date} — {self.song.title}"


def stem_upload_path(instance, filename):
    # Deliberately drops the uploader's original filename: it ends up in
    # the signed URL the frontend sends to players (Plan 3b), and a
    # filename like "luna-negra-drums.mp3" would leak the answer before
    # anyone guesses it. A random name also avoids silently overwriting
    # another day's object — Demucs gives every song the same stem
    # filenames (drums.wav, bass.wav, ...), so keeping the original name
    # would collide across different DailySong rows.
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    # str(), not .isoformat(): a DailySong built via .create(date="...")
    # (rather than loaded from the database) keeps `date` as a plain str
    # until the next full_clean/refresh, and str() on an actual date
    # object already yields the same ISO format.
    return f"stems/{instance.daily_song.date}/{uuid.uuid4().hex}.{ext}"


def get_stems_storage():
    # A function, not a direct reference, so Django resolves the "stems"
    # entry from STORAGES at save/access time — not at import time, before
    # settings (and tests' override of this setting) are fully loaded.
    return storages["stems"]


class Stem(models.Model):
    DRUMS = "drums"
    BASS = "bass"
    VOCALS = "vocals"
    OTHER = "other"
    STEM_TYPE_CHOICES = [
        (DRUMS, "Batería"),
        (BASS, "Bajo"),
        (VOCALS, "Voz"),
        (OTHER, "Otros"),
    ]
    # The game unlocks stems in this fixed order (and the voice last, so it is the hardest hint). It is decided
    # by the type, not by `unlock_order`, so a wrong number typed in the admin can't change the game.
    UNLOCK_RANK = {DRUMS: 1, BASS: 2, OTHER: 3, VOCALS: 4}

    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="stems")
    stem_type = models.CharField(max_length=10, choices=STEM_TYPE_CHOICES)
    unlock_order = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(4)]
    )
    # What was uploaded (usually a WAV). Kept to be able to convert again, and served only while there are no versions.
    audio_file = models.FileField(upload_to=stem_upload_path, storage=get_stems_storage)
    # What the players download, made when the original is uploaded (gameplay/audio.py): AAC, good and light.
    audio_high = models.FileField(upload_to=stem_upload_path, storage=get_stems_storage, blank=True)
    audio_low = models.FileField(upload_to=stem_upload_path, storage=get_stems_storage, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["daily_song", "unlock_order"], name="unique_unlock_order_per_day"
            ),
            models.UniqueConstraint(
                fields=["daily_song", "stem_type"], name="unique_stem_type_per_day"
            ),
            models.CheckConstraint(
                condition=models.Q(unlock_order__gte=1, unlock_order__lte=4),
                name="unlock_order_between_1_and_4",
            ),
        ]
        ordering = ["unlock_order"]

    def __str__(self):
        return f"{self.daily_song} — {self.get_stem_type_display()} (#{self.unlock_order})"

    def save(self, *args, **kwargs):
        new_upload = bool(self.audio_file) and not self.audio_file._committed  # not a stem that was already stored
        if new_upload:
            # The versions belong to the previous audio (if any): they stop being served at once. The new ones are made
            # after the save, in the background (gameplay/jobs.py): converting here would hold the request up for minutes.
            self.audio_high = ""
            self.audio_low = ""
        super().save(*args, **kwargs)
        if new_upload:
            jobs.schedule_conversion(self.pk)

    def make_versions(self, data: bytes | None = None) -> bool:
        """Converts the original into the versions the players download. If it cannot be converted the stem is still
        saved and served as it was uploaded, and the versions of any previous audio are dropped (they would play the
        old song). Returns whether the versions were made."""
        if data is None:
            file = self.audio_file.file
            file.seek(0)
            data = file.read()
            file.seek(0)
        try:
            versions = audio.encode_variants(data)
        except audio.AudioError as error:
            logger.warning("No se pudo convertir el audio de %s: %s. Se usa el original.", self, error)
            self.audio_high = ""
            self.audio_low = ""
            return False
        self.audio_high.save("high.m4a", ContentFile(versions["high"]), save=False)
        self.audio_low.save("low.m4a", ContentFile(versions["low"]), save=False)
        return True

    def versions(self) -> dict[str, str]:
        """The URL of each version that exists (empty if the stem was never converted)."""
        found = {"high": self.audio_high, "low": self.audio_low}
        return {name: field.url for name, field in found.items() if field}

    @property
    def playable_url(self) -> str:
        """What a player downloads by default: the good version, or the original if there are none."""
        return (self.audio_high or self.audio_file).url


class GuessAttempt(models.Model):
    device_id = models.CharField(max_length=64)
    # Set when it was played with a session or claimed at sign-in. Deleting the account deletes the games.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="attempts"
    )
    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="attempts")
    attempt_number = models.PositiveSmallIntegerField()
    guessed_text = models.CharField(max_length=255)
    # The catalog song that was guessed, so any device can draw the whole row. Null for older attempts and if the
    # song is later removed from the catalog (the game is kept either way).
    guessed_song = models.ForeignKey(
        "catalog.Song", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    is_correct = models.BooleanField()
    feedback = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "intento"
        verbose_name_plural = "intentos"
        ordering = ["attempt_number"]
        constraints = [
            # Only for games without an account: an account's games are kept apart by the per-user constraint
            # below, so signing in or out on a shared device never collides with the anonymous ones.
            models.UniqueConstraint(
                fields=["device_id", "daily_song", "attempt_number"],
                condition=models.Q(user__isnull=True),
                name="unique_attempt_number_per_device_per_day",
            ),
            # An account plays once a day whatever device it uses.
            models.UniqueConstraint(
                fields=["user", "daily_song", "attempt_number"],
                condition=models.Q(user__isnull=False),
                name="unique_attempt_number_per_user_per_day",
            ),
        ]


class ScoreEntry(models.Model):
    device_id = models.CharField(max_length=64)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="scores"
    )
    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="scores")
    display_name = models.CharField(max_length=50)
    score = models.PositiveIntegerField()
    winning_attempt = models.PositiveSmallIntegerField()
    total_time_seconds = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "puntaje"
        verbose_name_plural = "puntajes"
        constraints = [
            models.UniqueConstraint(
                fields=["device_id", "daily_song"],
                condition=models.Q(user__isnull=True),
                name="one_score_per_device_per_day",
            ),
            models.UniqueConstraint(
                fields=["user", "daily_song"],
                condition=models.Q(user__isnull=False),
                name="one_score_per_user_per_day",
            ),
        ]


def empty_distribution():
    """Games won in 1, 2, ... 6 attempts."""
    return [0, 0, 0, 0, 0, 0]


class PlayerStats(models.Model):
    """What the server knows about a player, saved and updated by the server itself when a game ends.

    Never filled from anything the client sends: it is recomputed from the validated attempts and scores
    (see gameplay.stats). A player is an account or, until one is created, a device; the row follows the player when
    the games are claimed by an account.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="stats"
    )
    # Only while the player has no account.
    device_id = models.CharField(max_length=64, blank=True, default="")
    # Chosen once, shown in the rankings. Unique whatever the case.
    public_name = models.CharField(max_length=50, null=True, blank=True)
    # When the player last changed their public name (null: never). Changes need a wait between them.
    name_changed_at = models.DateTimeField(null=True, blank=True)
    played = models.PositiveIntegerField(default=0)
    won = models.PositiveIntegerField(default=0)
    current_streak = models.PositiveIntegerField(default=0)
    max_streak = models.PositiveIntegerField(default=0)
    total_score = models.PositiveIntegerField(default=0)
    distribution = models.JSONField(default=empty_distribution)
    last_played_day = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "estadísticas de jugador"
        verbose_name_plural = "estadísticas de jugadores"
        constraints = [
            models.UniqueConstraint(
                fields=["device_id"],
                condition=models.Q(user__isnull=True),
                name="one_stats_row_per_anonymous_device",
            ),
            models.UniqueConstraint(
                Lower("public_name"),
                condition=models.Q(public_name__isnull=False),
                name="public_name_is_unique_whatever_the_case",
            ),
            models.CheckConstraint(
                condition=models.Q(user__isnull=False) | ~models.Q(device_id=""),
                name="stats_row_has_an_owner",
            ),
        ]
