import time
from collections import Counter

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.db.utils import InterfaceError, OperationalError
from django.utils import timezone

from catalog.deezer import DeezerError, DeezerNotFound, get_artist
from catalog.models import Artist

DB_ATTEMPTS = 3


class Command(BaseCommand):
    help = (
        "Guarda la foto de cada artista ya emparejado con Deezer (un pedido por artista, despacio). Solo completa las que "
        "faltan y marca a los que no tienen foto para no volver a pedirla. Se puede cortar y volver a correr. Pensado para "
        "correr desde una computadora (scripts/catalogo.sh fotos)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=0, help="procesar como mucho N artistas (0 = todos)")
        parser.add_argument("--reintentar", action="store_true", help="volver a pedir la foto de los que ya se miraron sin encontrarla")
        parser.add_argument("--dry-run", action="store_true", help="modo prueba: consulta Deezer pero no guarda nada")

    def log(self, message=""):
        self.stdout.write(f"[{time.strftime('%H:%M:%S')}] {message}")

    def handle(self, *args, **options):
        self.dry_run = options["dry_run"]
        self.stats = Counter()
        artists = Artist.objects.filter(deezer_id__isnull=False, picture_url="").order_by("id")
        if not options["reintentar"]:
            artists = artists.filter(picture_checked_at__isnull=True)
        if options["limit"]:
            artists = artists[: options["limit"]]
        artists = list(artists)

        if self.dry_run:
            self.log("MODO PRUEBA: se consulta Deezer pero no se guarda nada.")
        self.log(f"{len(artists)} artista(s) sin foto para buscar.")

        for position, artist in enumerate(artists, 1):
            for attempt in range(1, DB_ATTEMPTS + 1):
                try:
                    self._fill(artist, position, len(artists))
                    break
                except (OperationalError, InterfaceError) as exc:
                    connection.close()  # Django opens a new connection on the next query
                    if attempt == DB_ATTEMPTS:
                        self.stats["artistas con error"] += 1
                        self.log(f"  ERROR: se perdió la conexión con la base {DB_ATTEMPTS} veces ({type(exc).__name__}); se sigue con el próximo.")
                        break
                    self.log(f"  Se perdió la conexión con la base ({type(exc).__name__}): reconecto y reintento ({attempt}/{DB_ATTEMPTS - 1}).")
                    time.sleep(5 * attempt)

        self.log("Resumen:")
        for label, count in sorted(self.stats.items()):
            self.log(f"  {label}: {count}")

    def _fill(self, artist, position, total):
        try:
            picture = get_artist(artist.deezer_id)["picture"]
        except DeezerNotFound:
            picture = ""  # the profile no longer exists in Deezer: marked as looked at
        except DeezerError as exc:
            self.stats["artistas con error"] += 1
            self.log(f"[{position}/{total}] {artist.name}: ERROR, se reintenta en la próxima corrida ({exc})")
            return
        self.stats["con foto" if picture else "sin foto en Deezer"] += 1
        self.log(f"[{position}/{total}] {artist.name}: {'foto encontrada' if picture else 'sin foto'}")
        if self.dry_run:
            return
        with transaction.atomic():
            artist.picture_url = picture
            artist.picture_checked_at = timezone.now()
            artist.save(update_fields=["picture_url", "picture_checked_at"])
