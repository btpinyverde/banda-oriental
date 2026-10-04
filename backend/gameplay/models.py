import uuid

from django.conf import settings
from django.core.files.storage import storages
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from catalog.models import Song


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
    audio_file = models.FileField(upload_to=stem_upload_path, storage=get_stems_storage)

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


class GuessAttempt(models.Model):
    device_id = models.CharField(max_length=64)
    # Set when it was played with a session or claimed at sign-in. Deleting the account deletes the games.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="attempts"
    )
    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="attempts")
    attempt_number = models.PositiveSmallIntegerField()
    guessed_text = models.CharField(max_length=255)
    is_correct = models.BooleanField()
    feedback = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
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
