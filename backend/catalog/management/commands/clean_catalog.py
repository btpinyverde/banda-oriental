from collections import Counter, defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog.matching import base_title
from catalog.verification import QUARANTINE_REASON
from catalog.models import Album, Song
from gameplay.models import DailySong

KIND_RANK = {"album": 0, "ep": 1, "single": 2}
EXAMPLES = 10
MIN_SHARE_TO_INFER_GENRE = 0.6


class Command(BaseCommand):
    help = (
        "Cleans the catalog without losing anything. Dry run unless --aplicar: it only says what it would do. "
        "Nothing is deleted: repeated songs and classical music are HIDDEN (out of the game and the archive; --restaurar "
        "shows them again) and the songs of any day, played or scheduled, are never touched. "
        "Run it AFTER sync_deezer, so everything that is going to be loaded is already there."
    )

    def add_arguments(self, parser):
        parser.add_argument("--duplicadas", action="store_true", help="hide the repeats of the same song (same artist and title on several records)")
        parser.add_argument("--clasica", action="store_true", help="hide the songs of records with the genre classical")
        parser.add_argument("--generos", action="store_true", help="unify the same genre written in different ways")
        parser.add_argument("--inferir-genero", action="store_true", help="give a record with no genre the one most of its artist's records have")
        parser.add_argument("--restaurar", action="store_true", help="show again what this command hid")
        parser.add_argument("--aplicar", action="store_true", help="really do it (without this flag only reports)")

    def handle(self, *args, **options):
        tasks = [name for name in ("duplicadas", "clasica", "generos", "inferir_genero", "restaurar") if options[name]]
        if not tasks:
            raise CommandError("Indicá qué limpiar: --duplicadas, --clasica, --generos (y --inferir-genero) o --restaurar.")
        self.apply = options["aplicar"]
        if not self.apply:
            self.stdout.write("Modo prueba: no se cambia nada (agregá --aplicar para guardar).")
        self.in_use = set(DailySong.objects.values_list("song_id", flat=True))
        with transaction.atomic():
            if options["restaurar"]:
                self._restore()
            if options["duplicadas"]:
                self._duplicates()
            if options["clasica"]:
                self._classical()
            if options["generos"] or options["inferir_genero"]:
                self._genres(unify=options["generos"], infer=options["inferir_genero"])

    # ---------- helpers ----------

    def _verb(self, count, thing):
        verb = "ocultaron" if self.apply else "ocultarían"
        return f"Se {verb} {count} {thing}"

    def _hide(self, songs, reason):
        if self.apply and songs:
            Song.objects.filter(pk__in=[s.pk for s in songs]).update(hidden=True, hidden_reason=reason)

    # ---------- tasks ----------

    def _restore(self):
        queryset = Song.objects.filter(hidden=True).exclude(hidden_reason="").exclude(hidden_reason=QUARANTINE_REASON)
        count = queryset.count()
        if self.apply:
            queryset.update(hidden=False, hidden_reason="")
        verb = "restauraron" if self.apply else "restaurarían"
        self.stdout.write(f"Se {verb} {count} canciones que había ocultado este comando (lo ocultado a mano no se toca).")

    @staticmethod
    def _score(song, in_use):
        """Lower is better: a song of a day first, then the full record, the earliest year, one with data."""
        album = song.album
        return (
            0 if song.pk in in_use else 1,
            KIND_RANK.get(album.release_type, 0),
            album.year or 9999,
            0 if song.duration_seconds else 1,
            0 if album.genre else 1,
            song.pk,
        )

    def _duplicates(self):
        groups = defaultdict(list)
        for song in Song.objects.filter(hidden=False).select_related("album__artist"):
            title = base_title(song.title)
            if title:
                groups[(song.album.artist_id, title)].append(song)
        to_hide, examples = [], []
        for songs in groups.values():
            if len(songs) < 2:
                continue
            keep = min(songs, key=lambda s: self._score(s, self.in_use))
            extra = [s for s in songs if s is not keep and s.pk not in self.in_use]
            to_hide += extra
            if extra and len(examples) < EXAMPLES:
                examples.append((keep, extra))
        self._hide(to_hide, "duplicate")
        self.stdout.write(self._verb(len(to_hide), "canciones repetidas."))
        for keep, extra in examples:
            where = lambda s: f"«{s.album.name}»" + (f" ({s.album.year})" if s.album.year else "")  # noqa: E731
            self.stdout.write(f"  {keep.album.artist.name} — {keep.title}: queda {where(keep)}; se oculta {', '.join(where(s) for s in extra)}")

    def _classical(self):
        songs = [
            s
            for s in Song.objects.filter(hidden=False, album__genre__iexact="classical").select_related("album__artist")
            if s.pk not in self.in_use
        ]
        self._hide(songs, "classical")
        self.stdout.write(self._verb(len(songs), "canciones de discos de música clásica."))
        for artist, count in Counter(s.album.artist.name for s in songs).most_common(EXAMPLES):
            self.stdout.write(f"  {artist}: {count}")

    def _genres(self, *, unify, infer):
        albums = list(Album.objects.all().select_related("artist"))
        spellings = Counter(a.genre.strip() for a in albums if a.genre.strip())
        by_key = defaultdict(list)
        for spelling, count in spellings.items():
            by_key[spelling.lower()].append((count, spelling))
        # The commonest way of writing each genre wins (a tie goes to the one that sorts first).
        canonical = {key: sorted(options, key=lambda o: (-o[0], o[1]))[0][1] for key, options in by_key.items()}

        changes = {}  # album id -> new genre
        if unify:
            for album in albums:
                current = album.genre.strip()
                if current and canonical[current.lower()] != album.genre:
                    changes[album.pk] = canonical[current.lower()]
            self.stdout.write(f"{'Se unificaron' if self.apply else 'Se unificarían'} {len(changes)} discos con el género escrito de otra forma.")

        if infer:
            per_artist = defaultdict(Counter)
            for album in albums:
                if album.genre.strip():
                    per_artist[album.artist_id][canonical[album.genre.strip().lower()]] += 1
            has_songs = set(Song.objects.filter(hidden=False).values_list("album_id", flat=True))
            inferred = 0
            for album in albums:
                if album.genre.strip() or album.pk not in has_songs or album.artist_id not in per_artist:
                    continue
                genre, count = per_artist[album.artist_id].most_common(1)[0]
                if count / sum(per_artist[album.artist_id].values()) >= MIN_SHARE_TO_INFER_GENRE:
                    changes[album.pk] = genre
                    inferred += 1
            self.stdout.write(f"{'Se completaron' if self.apply else 'Se completarían'} {inferred} discos sin género con el que tiene casi todo su artista.")

        if self.apply:
            for album in albums:
                if album.pk in changes:
                    Album.objects.filter(pk=album.pk).update(genre=changes[album.pk])
