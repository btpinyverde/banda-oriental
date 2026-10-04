from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Album, Artist, Song
from .views import ALBUMS_CACHE_KEY, SONGS_CACHE_KEY


@receiver([post_save, post_delete], sender=Song)
def forget_the_cached_song_list(sender, **kwargs):
    """A song saved or deleted one by one (admin, shell) shows up right away. Bulk imports skip signals and run in
    another process, so for those the list refreshes when its few minutes of cache run out."""
    cache.delete(SONGS_CACHE_KEY)
    cache.delete(ALBUMS_CACHE_KEY)  # the number of songs of an album changed


@receiver([post_save, post_delete], sender=Album)
@receiver([post_save, post_delete], sender=Artist)
def forget_the_cached_album_list(sender, **kwargs):
    """The album list shows names, years and genres of albums and artists: editing one shows up right away too."""
    cache.delete(ALBUMS_CACHE_KEY)
    cache.delete(SONGS_CACHE_KEY)  # the song list also carries the artist and album names
