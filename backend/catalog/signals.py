from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Song
from .views import SONGS_CACHE_KEY


@receiver([post_save, post_delete], sender=Song)
def forget_the_cached_song_list(sender, **kwargs):
    """A song saved or deleted one by one (admin, shell) shows up right away. Bulk imports skip signals and run in
    another process, so for those the list refreshes when its few minutes of cache run out."""
    cache.delete(SONGS_CACHE_KEY)
