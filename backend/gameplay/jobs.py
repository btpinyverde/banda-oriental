"""Converting a stem takes a while (minutes for four full-length songs on the small free server), far longer than the
30 seconds a request is given before gunicorn kills the worker. So the admin save only stores the original and the
conversion runs afterwards, in the background, one at a time."""

import logging
import threading

from django.conf import settings
from django.db import close_old_connections, transaction

logger = logging.getLogger(__name__)

# One conversion at a time: the server is small, and two ffmpeg at once would only slow both down (or run out of memory).
_lock = threading.Lock()


def schedule_conversion(stem_pk: int) -> None:
    """Runs after the save is committed (the row must exist for the thread to find it). In production in a background
    thread; with STEM_CONVERSION_BACKGROUND off (the tests) right there."""

    def start():
        if getattr(settings, "STEM_CONVERSION_BACKGROUND", True):
            threading.Thread(target=_run, args=(stem_pk,), daemon=True, name=f"convert-stem-{stem_pk}").start()
        else:
            convert_stem(stem_pk)

    transaction.on_commit(start)


def _run(stem_pk: int) -> None:
    try:
        convert_stem(stem_pk)
    except Exception:  # a background thread must never die silently
        logger.exception("Falló la conversión del audio del stem %s", stem_pk)
    finally:
        close_old_connections()


def convert_stem(stem_pk: int) -> bool:
    """Makes the versions of one stem from its original. Returns whether they were made. If the audio was replaced
    while converting, the result belongs to the old audio and is dropped."""
    from .models import Stem

    with _lock:
        stem = Stem.objects.filter(pk=stem_pk).first()
        if stem is None or not stem.audio_file or (stem.audio_high and stem.audio_low):
            return False
        original = stem.audio_file.name
        with stem.audio_file.open("rb") as file:
            data = file.read()
        if not stem.make_versions(data):
            return False
        current = Stem.objects.filter(pk=stem_pk).values_list("audio_file", flat=True).first()
        if current != original:
            stem.audio_high.delete(save=False)
            stem.audio_low.delete(save=False)
            logger.info("El audio del stem %s cambió mientras se convertía: se descarta el resultado.", stem_pk)
            return False
        stem.save(update_fields=["audio_high", "audio_low"])
        return True
