from django.db.models.signals import post_delete, pre_save
from django.db.transaction import on_commit
from django.dispatch import receiver

from .models import Stem

AUDIO_FIELDS = ("audio_file", "audio_high", "audio_low")


@receiver(post_delete, sender=Stem)
def delete_stem_audio_files_from_storage(sender, instance, **kwargs):
    for name in AUDIO_FIELDS:
        field = getattr(instance, name)
        if field:
            on_commit(lambda field=field: field.delete(save=False))


@receiver(pre_save, sender=Stem)
def delete_previous_audio_files_when_replaced(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        return
    for name in AUDIO_FIELDS:
        old_file = getattr(old, name)
        if old_file and old_file.name != getattr(instance, name).name:
            on_commit(lambda old_file=old_file: old_file.delete(save=False))
