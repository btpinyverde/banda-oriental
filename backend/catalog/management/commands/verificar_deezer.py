import time
from collections import Counter

from django.core.management.base import BaseCommand

from catalog import verification as v
from catalog.models import Artist
from catalog.verification import check_deezer_link, disc_evidence


class Command(BaseCommand):
    help = (
        "Verifies the artists matched with Deezer: a profile is trusted only if MusicBrainz or Wikidata point to it (asked by id, "
        "never by name) or the discs of both sources agree. Saves the answer in each artist; can be stopped and resumed (it skips "
        "the ones already answered). A network error leaves that artist pending for the next run."
    )

    def add_arguments(self, parser):
        parser.add_argument("--todos", action="store_true", help="also re-check the ones already answered (what was confirmed by hand is never changed)")
        parser.add_argument("--limit", type=int, default=0, help="at most N artists (0 = all)")
        parser.add_argument("--dry-run", action="store_true", help="ask but do not save")

    def handle(self, *args, **options):
        artists = Artist.objects.filter(deezer_id__isnull=False).order_by("id")
        if not options["todos"]:
            artists = artists.filter(deezer_status="")
        artists = artists.exclude(deezer_status=v.VERIFIED, deezer_source="manual")
        if options["limit"]:
            artists = artists[: options["limit"]]
        artists = list(artists)
        stats = Counter()
        write = self.stdout.write
        write(f"{len(artists)} artista(s) para verificar.")

        for position, artist in enumerate(artists, 1):
            if disc_evidence(artist):
                verdict = v.Verdict(v.VERIFIED, "discos")
            else:
                try:
                    verdict = check_deezer_link(artist.mbid, artist.deezer_id)
                except Exception as error:  # a network failure must not stop the whole run
                    stats["error"] += 1
                    write(f"[{position}/{len(artists)}] {artist.name}: error ({type(error).__name__}), queda pendiente.")
                    continue
            stats[verdict.status] += 1
            if not options["dry_run"]:
                Artist.objects.filter(pk=artist.pk).update(
                    deezer_status=verdict.status, deezer_source=verdict.source, deezer_suggested_id=verdict.suggested_id
                )
            if position % 50 == 0:
                write(f"[{position}/{len(artists)}] {time.strftime('%H:%M:%S')}")

        write("\n== Resultado ==" + (" (modo prueba: no se guardó nada)" if options["dry_run"] else ""))
        write(f"Verificados: {stats[v.VERIFIED]}")
        write(f"Equivocados: {stats[v.WRONG]} (MusicBrainz o Wikidata dicen que es otro perfil)")
        write(f"Sin verificar: {stats[v.UNVERIFIED]} (nadie los respalda)")
        write(f"Con error: {stats['error']} (quedan para la próxima corrida)")
