from django.db.models.signals import post_delete, pre_save
from django.db.transaction import on_commit
from django.dispatch import receiver

from .models import Stem


@receiver(post_delete, sender=Stem)
def delete_stem_audio_file_from_storage(sender, instance, **kwargs):
    if instance.audio_file:
        on_commit(lambda: instance.audio_file.delete(save=False))


@receiver(pre_save, sender=Stem)
def delete_previous_audio_file_when_replaced(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old_file = sender.objects.get(pk=instance.pk).audio_file
    except sender.DoesNotExist:
        return
    if old_file and old_file.name != instance.audio_file.name:
        on_commit(lambda: old_file.delete(save=False))
