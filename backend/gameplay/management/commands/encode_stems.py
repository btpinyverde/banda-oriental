from django.core.management.base import BaseCommand

from gameplay import audio
from gameplay.models import Stem


class Command(BaseCommand):
    help = (
        "Converts to AAC the stems that were uploaded without versions (the ones from before the conversion on upload, "
        "or the ones that could not be converted). The original stays. Safe to run again: it skips the ones that have them."
    )

    def handle(self, *args, **options):
        done = failed = 0
        for stem in Stem.objects.filter(audio_high="") | Stem.objects.filter(audio_low=""):
            try:
                with stem.audio_file.open("rb") as file:
                    data = file.read()
                converted = stem.make_versions(data)
            except Exception as error:  # a missing file in the storage, for instance: the rest must go on
                self.stderr.write(f"{stem}: {error}")
                failed += 1
                continue
            if converted:
                stem.save(update_fields=["audio_high", "audio_low"])
                done += 1
                self.stdout.write(f"{stem}: convertido")
            else:
                failed += 1
                self.stdout.write(f"{stem}: no se pudo convertir ({stem.stem_type})")
        self.stdout.write(f"Listo: {done} convertidos, {failed} con problemas.")
