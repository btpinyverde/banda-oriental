import csv

from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from catalog.models import Artist

CONFIRMED, NO_REFERENCE, NO_MATCH, MIX = "confirmado", "sin_referencia", "sin_coincidencia", "posible_mezcla"
LABELS = {NO_REFERENCE: "Sin referencia", NO_MATCH: "Sin coincidencia", MIX: "Posible mezcla"}
# A confirmed artist is a POSSIBLE MIX when Deezer alone brings at least this many discs, and at least this many times the discs both sources know.
MIN_ONLY_DEEZER, PROPORTION = 10, 3


class Command(BaseCommand):
    help = (
        "Audits the artists matched with Deezer. Read only: it changes nothing. Deezer matches by exact name, so a homonym can load "
        "someone else's records. An artist is CONFIRMED when at least one record is known to both MusicBrainz and Deezer; AT RISK "
        "when nothing but Deezer backs its records up: 'sin_referencia' (MusicBrainz has no records of it, Deezer decided alone) or "
        "'sin_coincidencia' (MusicBrainz has records but none of them is in Deezer). A confirmed artist can still be a "
        "'posible_mezcla': one record matches but Deezer adds many more than the ones both sources know (a homonym's records mixed in)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--csv", help="write the full list of artists at risk to this file")
        parser.add_argument("--minimo-discos", type=int, default=MIN_ONLY_DEEZER, help="discs only Deezer has, from which a confirmed artist may be a mix")
        parser.add_argument("--proporcion", type=int, default=PROPORTION, help="how many times the confirmed discs the discs only Deezer has must be, for a mix")
        parser.add_argument("--ejemplos", type=int, default=20, help="how many artists at risk to show (the ones with the most records first)")

    def handle(self, *args, **options):
        rows = self._classify(options["minimo_discos"], options["proporcion"])
        write = self.stdout.write
        at_risk = [r for r in rows if r["estado"] != CONFIRMED]
        write("== Emparejados con Deezer ==")
        write(f"Emparejados con Deezer: {len(rows)}")
        write(f"Confirmados: {len(rows) - len(at_risk)} (conocen MusicBrainz y Deezer algún disco, y Deezer no agrega muchos más)")
        write(f"En riesgo: {len(at_risk)}")
        for state in (NO_REFERENCE, NO_MATCH, MIX):
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

    def _classify(self, min_only_deezer=MIN_ONLY_DEEZER, proportion=PROPORTION):
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
                mixed = artist.only_deezer >= min_only_deezer and artist.only_deezer >= proportion * artist.confirmed
                state = MIX if mixed else CONFIRMED
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
