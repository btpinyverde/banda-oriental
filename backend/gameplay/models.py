from django.core.files.storage import storages
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
    return f"stems/{instance.daily_song.date.isoformat()}/{instance.stem_type}-{filename}"


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

    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="stems")
    stem_type = models.CharField(max_length=10, choices=STEM_TYPE_CHOICES)
    unlock_order = models.PositiveSmallIntegerField()
    audio_file = models.FileField(upload_to=stem_upload_path, storage=get_stems_storage)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["daily_song", "unlock_order"], name="unique_unlock_order_per_day"
            ),
        ]
        ordering = ["unlock_order"]

    def __str__(self):
        return f"{self.daily_song} — {self.get_stem_type_display()} (#{self.unlock_order})"


class GuessAttempt(models.Model):
    device_id = models.CharField(max_length=64)
    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="attempts")
    attempt_number = models.PositiveSmallIntegerField()
    guessed_text = models.CharField(max_length=255)
    is_correct = models.BooleanField()
    feedback = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["attempt_number"]


class ScoreEntry(models.Model):
    device_id = models.CharField(max_length=64)
    daily_song = models.ForeignKey(DailySong, on_delete=models.CASCADE, related_name="scores")
    display_name = models.CharField(max_length=50)
    score = models.PositiveIntegerField()
    winning_attempt = models.PositiveSmallIntegerField()
    total_time_seconds = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["device_id", "daily_song"], name="one_score_per_device_per_day"
            ),
        ]
