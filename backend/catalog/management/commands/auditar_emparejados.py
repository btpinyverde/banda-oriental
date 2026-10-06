import csv

from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from catalog.models import Artist

CONFIRMED, NO_REFERENCE, NO_MATCH = "confirmado", "sin_referencia", "sin_coincidencia"
LABELS = {NO_REFERENCE: "Sin referencia", NO_MATCH: "Sin coincidencia"}


class Command(BaseCommand):
    help = (
        "Audits the artists matched with Deezer. Read only: it changes nothing. Deezer matches by exact name, so a homonym can load "
        "someone else's records. An artist is CONFIRMED when at least one record is known to both MusicBrainz and Deezer; AT RISK "
        "when nothing but Deezer backs its records up: 'sin_referencia' (MusicBrainz has no records of it, Deezer decided alone) or "
        "'sin_coincidencia' (MusicBrainz has records but none of them is in Deezer)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--csv", help="write the full list of artists at risk to this file")
        parser.add_argument("--ejemplos", type=int, default=20, help="how many artists at risk to show (the ones with the most records first)")

    def handle(self, *args, **options):
        rows = self._classify()
        write = self.stdout.write
        at_risk = [r for r in rows if r["estado"] != CONFIRMED]
        write("== Emparejados con Deezer ==")
        write(f"Emparejados con Deezer: {len(rows)}")
        write(f"Confirmados: {len(rows) - len(at_risk)} (un disco que conocen MusicBrainz y Deezer)")
        write(f"En riesgo: {len(at_risk)}")
        for state in (NO_REFERENCE, NO_MATCH):
            group = [r for r in at_risk if r["estado"] == state]
            write(f"  {LABELS[state]}: {len(group)} | {sum(r['discos'] for r in group)} discos y {sum(r['canciones'] for r in group)} canciones que solo respalda Deezer")

        shown = sorted(at_risk, key=lambda r: (-r["discos"], r["artista"]))[: options["ejemplos"]]
        if shown:
            write(f"\n== Los {len(shown)} con más discos en riesgo ==")
            for r in shown:
                write(f"{r['artista']} [{LABELS[r['estado']]}] — {r['discos']} discos, {r['canciones']} canciones: {r['muestra']}")
        if options["csv"]:
            self._write_csv(options["csv"], at_risk)
            write(f"\nLista completa en {options['csv']}")

    def _classify(self):
        artists = (
            Artist.objects.filter(deezer_id__isnull=False)
            .annotate(
                with_mb=Count("albums", filter=Q(albums__mbid__isnull=False), distinct=True),
                confirmed=Count("albums", filter=Q(albums__mbid__isnull=False, albums__deezer_id__isnull=False), distinct=True),
                only_deezer=Count("albums", filter=Q(albums__mbid__isnull=True, albums__deezer_id__isnull=False), distinct=True),
                only_deezer_songs=Count("albums__songs", filter=Q(albums__mbid__isnull=True, albums__deezer_id__isnull=False), distinct=True),
            )
            .order_by("name")
        )
        rows = []
        for artist in artists:
            if artist.confirmed:
                state = CONFIRMED
            elif artist.with_mb:
                state = NO_MATCH
            else:
                state = NO_REFERENCE
            sample = list(artist.albums.filter(mbid__isnull=True, deezer_id__isnull=False).values_list("name", flat=True)[:3])
            rows.append(
                {
                    "artista": artist.name,
                    "estado": state,
                    "mbid": artist.mbid,
                    "deezer_id": artist.deezer_id,
                    "discos": artist.only_deezer if state != CONFIRMED else 0,
                    "canciones": artist.only_deezer_songs if state != CONFIRMED else 0,
                    "muestra": "; ".join(sample),
                }
            )
        return rows

    def _write_csv(self, path, rows):
        with open(path, "w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow(["artista", "estado", "deezer_id", "discos", "canciones", "mbid", "muestra"])
            for r in sorted(rows, key=lambda r: (-r["discos"], r["artista"])):
                writer.writerow([r["artista"], r["estado"], r["deezer_id"], r["discos"], r["canciones"], r["mbid"], r["muestra"]])
