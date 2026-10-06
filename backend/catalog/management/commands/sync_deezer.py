import csv
import time
from collections import Counter

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.db.utils import InterfaceError, OperationalError
from django.utils import timezone

from catalog.deezer import DeezerError, get_album, get_artist_releases, search_artists
from catalog.matching import base_title, is_wanted_release, normalize_text, pick_artist
from catalog.models import Album, Artist, Song
from catalog.verification import VERIFIED, check_deezer_link

FULL_RELEASE_TYPES = {"album", "ep"}
# A run over wifi can last hours and the cloud database sometimes closes the connection ("server closed the connection
# unexpectedly"): the artist is retried on a new connection this many times before giving up on it for this run.
DB_ATTEMPTS = 3


class Command(BaseCommand):
    help = (
        "Completa discos y canciones de los artistas ya cargados usando Deezer: empareja cada artista por "
        "nombre exacto, trae álbumes, EP y singles (estos solo si su canción no está en un disco) y nunca "
        "pisa datos que ya existen. Se puede cortar y volver a correr. Pensado para correr desde una "
        "computadora (scripts/cargar-catalogo.sh), no desde el admin: tarda."
    )

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=0, help="procesar como mucho N artistas (0 = todos)")
        parser.add_argument("--artista", help="procesar solo al artista con este nombre")
        parser.add_argument("--reintentar", action="store_true", help="volver a procesar artistas ya revisados")
        parser.add_argument("--dry-run", action="store_true", help="modo prueba: consulta Deezer pero no guarda nada")
        parser.add_argument("--reporte", help="archivo CSV donde dejar los artistas sin emparejar")

    def log(self, message=""):
        self.stdout.write(f"[{time.strftime('%H:%M:%S')}] {message}")

    def handle(self, *args, **options):
        self.dry_run = options["dry_run"]
        self.stats = Counter()
        self.unmatched = []

        artists = Artist.objects.order_by("id")
        if options["artista"]:
            artists = artists.filter(name__iexact=options["artista"])
        elif not options["reintentar"]:
            artists = artists.filter(deezer_checked_at__isnull=True)
        if options["limit"]:
            artists = artists[: options["limit"]]
        artists = list(artists)

        if self.dry_run:
            self.log("MODO PRUEBA: se consulta Deezer pero no se guarda nada.")
        self.log(f"{len(artists)} artista(s) para procesar.")

        for position, artist in enumerate(artists, 1):
            self.log(f"[{position}/{len(artists)}] {artist.name}")
            for attempt in range(1, DB_ATTEMPTS + 1):
                try:
                    self._process(artist)
                    break
                except DeezerError as exc:
                    self.stats["artistas con error"] += 1
                    self.log(f"  ERROR, se reintenta en la próxima corrida: {exc}")
                    break
                except (OperationalError, InterfaceError) as exc:
                    connection.close()  # Django opens a new connection on the next query
                    if attempt == DB_ATTEMPTS:
                        self.stats["artistas con error"] += 1
                        self.log(f"  ERROR: se perdió la conexión con la base {DB_ATTEMPTS} veces ({type(exc).__name__}). Se sigue con el próximo; este se toma en la próxima corrida.")
                        break
                    self.log(f"  Se perdió la conexión con la base ({type(exc).__name__}): reconecto y reintento ({attempt}/{DB_ATTEMPTS - 1}).")
                    time.sleep(5 * attempt)

        if options["reporte"]:
            self._write_report(options["reporte"])
        self._print_summary()

    def _process(self, artist):
        if self.dry_run:
            # Todo dentro de una transacción que se descarta: se ve qué haría sin guardar nada.
            with transaction.atomic():
                self._sync_artist(artist)
                transaction.set_rollback(True)
        else:
            # Sin transacción envolvente: cada disco se guarda al terminarlo (ver _sync_artist),
            # así el avance se ve en la base y no se pierde nada si se corta la corrida.
            self._sync_artist(artist)

    # --- por artista -----------------------------------------------------------------------------------

    def _sync_artist(self, artist):
        if artist.deezer_id and artist.deezer_status == VERIFIED:
            # Ya verificado: nunca más se busca por nombre, se pide ese perfil.
            chosen = {"id": artist.deezer_id}
        else:
            if artist.deezer_id:
                candidates, chosen = [], {"id": artist.deezer_id}
            else:
                candidates = search_artists(artist.name)
                chosen = pick_artist(candidates, artist.name)
            if chosen is None:
                self._mark_unmatched(artist, candidates, "sin emparejar: ningún perfil de Deezer se llama igual")
                return
            if Artist.objects.filter(deezer_id=chosen["id"]).exclude(pk=artist.pk).exists():
                self._mark_unmatched(artist, candidates, f"el perfil de Deezer {chosen['id']} ya está asignado a otro artista")
                return
            # Que el nombre coincida no alcanza (hay homónimos de otros países): MusicBrainz o Wikidata tienen que apuntar al mismo perfil.
            try:
                verdict = check_deezer_link(artist.mbid, chosen["id"])
            except Exception as error:
                self.stats["artistas con error"] += 1
                self.log(f"  ERROR verificando el perfil {chosen['id']} ({type(error).__name__}): queda pendiente para la próxima corrida")
                return
            if verdict.status != VERIFIED:
                self._mark_unmatched(artist, candidates, f"sin respaldo: el perfil de Deezer {chosen['id']} no está confirmado por MusicBrainz ni Wikidata ({verdict.status})")
                return
            artist.deezer_id = chosen["id"]
            artist.deezer_status, artist.deezer_source = VERIFIED, verdict.source
            fields = ["deezer_id", "deezer_status", "deezer_source"]
            if not artist.picture_url and chosen.get("picture"):
                artist.picture_url = chosen["picture"]  # the photo comes with the match: one less request later
                fields.append("picture_url")
            artist.save(update_fields=fields)
            self.stats["artistas emparejados"] += 1

        releases = [r for r in get_artist_releases(chosen["id"]) if is_wanted_release(r["title"], r["record_type"])]
        full = self._one_per_title([r for r in releases if r["record_type"] in FULL_RELEASE_TYPES])
        singles = self._one_per_title([r for r in releases if r["record_type"] not in FULL_RELEASE_TYPES])
        self.log(f"  {len(full)} disco(s)/EP y {len(singles)} single(s) en Deezer")

        complete = True
        # Primero discos y EP, después singles: así se sabe qué canciones ya están en un disco.
        for release, is_single in [(r, False) for r in full] + [(r, True) for r in singles]:
            try:
                with transaction.atomic():
                    if is_single:
                        self._import_single(artist, release)
                    else:
                        self._import_full_release(artist, release)
            except DeezerError as exc:
                complete = False
                self.stats["lanzamientos con error"] += 1
                self.log(f"    ERROR en «{release['title']}»: {exc}")

        if complete:
            artist.deezer_checked_at = timezone.now()
            artist.save(update_fields=["deezer_checked_at"])

    def _mark_unmatched(self, artist, candidates, reason):
        artist.deezer_checked_at = timezone.now()
        artist.save(update_fields=["deezer_checked_at"])
        self.unmatched.append((artist, candidates))
        self.stats["artistas sin emparejar"] += 1
        self.log(f"  {reason}")

    @staticmethod
    def _one_per_title(releases):
        """Entre "Eco" y "Eco (Deluxe Edition)" se queda con el de título más corto (la edición estándar)."""
        chosen = {}
        for release in sorted(releases, key=lambda r: len(r["title"])):
            chosen.setdefault(base_title(release["title"]), release)
        return list(chosen.values())

    # --- lanzamientos ----------------------------------------------------------------------------------

    def _import_full_release(self, artist, release):
        detail = get_album(release["id"])
        album = Album.objects.filter(deezer_id=detail["id"]).first() or self._album_with_same_title(artist, detail["title"])
        if album is None:
            album = self._create_album(artist, detail, detail["record_type"])
            self.stats["discos nuevos"] += 1
            action = "nuevo"
        else:
            self._complete_album(album, detail)
            self.stats["discos ya existentes"] += 1
            action = "ya existía, se completó"
        created = self._import_tracks(artist, album, detail["tracks"])
        self.log(f"    {detail['title']} [{detail['year'] or 's/año'}] ({action}) → {created} canción(es) nueva(s)")

    def _import_single(self, artist, release):
        known_titles = self._known_song_titles(artist)
        if normalize_text(release["title"]) in known_titles or self._album_with_same_title(artist, release["title"]):
            self.stats["singles ya en un disco"] += 1
            return

        detail = get_album(release["id"])
        new_tracks = [t for t in detail["tracks"] if normalize_text(t["title"]) not in known_titles]
        if not new_tracks:
            self.stats["singles ya en un disco"] += 1
            return

        album = Album.objects.filter(deezer_id=detail["id"]).first() or self._create_album(artist, detail, "single")
        self._import_tracks(artist, album, new_tracks)
        self.stats["singles nuevos"] += 1
        self.log(f"    Single: {detail['title']} [{detail['year'] or 's/año'}]")

    @staticmethod
    def _album_with_same_title(artist, title):
        wanted = base_title(title)
        for album in Album.objects.filter(artist=artist):
            if base_title(album.name) == wanted:
                return album
        return None

    @staticmethod
    def _create_album(artist, detail, release_type):
        return Album.objects.create(
            artist=artist,
            name=detail["title"],
            year=detail["year"],
            genre=detail["genre"],
            cover_art_url=detail["cover_url"],
            deezer_id=detail["id"],
            release_type=release_type if release_type in ("album", "ep", "single") else "album",
        )

    @staticmethod
    def _complete_album(album, detail):
        """Completa solo lo que está vacío: lo que ya había (o se editó a mano) manda."""
        if album.deezer_id is None:
            album.deezer_id = detail["id"]
        if album.year is None:
            album.year = detail["year"]
        if not album.genre:
            album.genre = detail["genre"]
        if not album.cover_art_url:
            album.cover_art_url = detail["cover_url"]
        album.save()

    # --- canciones -------------------------------------------------------------------------------------

    @staticmethod
    def _known_song_titles(artist):
        return {normalize_text(t) for t in Song.objects.filter(album__artist=artist).values_list("title", flat=True)}

    def _import_tracks(self, artist, album, tracks):
        by_title = {normalize_text(s.title): s for s in Song.objects.filter(album__artist=artist)}
        created = 0
        for track in tracks:
            song = Song.objects.filter(deezer_id=track["id"]).first() or by_title.get(normalize_text(track["title"]))
            if song is None:
                song = Song.objects.create(
                    album=album, title=track["title"], duration_seconds=track["duration_seconds"], deezer_id=track["id"]
                )
                by_title[normalize_text(track["title"])] = song
                created += 1
                self.stats["canciones nuevas"] += 1
                continue
            if song.deezer_id is None:
                song.deezer_id = track["id"]
            if song.duration_seconds is None:
                song.duration_seconds = track["duration_seconds"]
            song.save()
            self.stats["canciones ya existentes"] += 1
        return created

    # --- reportes --------------------------------------------------------------------------------------

    def _write_report(self, path):
        with open(path, "w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(["artista", "mbid", "candidatos_deezer"])
            for artist, candidates in self.unmatched:
                writer.writerow([artist.name, artist.mbid, "; ".join(f"{c['name']} ({c['id']})" for c in candidates)])
        self.log(f"Artistas sin emparejar guardados en {path}")

    def _print_summary(self):
        self.log("Resumen:")
        for label, count in sorted(self.stats.items()):
            self.log(f"  {label}: {count}")
