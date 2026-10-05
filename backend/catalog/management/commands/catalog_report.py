from collections import Counter

from django.core.management.base import BaseCommand
from django.db.models import Count

from catalog.matching import base_title
from catalog.models import Album, Artist, Song


class Command(BaseCommand):
    help = "Reports how complete the catalog is (genre, year, cover, duration, Deezer matches, repeats...). Read only."

    def handle(self, *args, **options):
        write = self.stdout.write
        songs = Song.objects.filter(hidden=False)
        albums = Album.objects.all()
        artists = Artist.objects.all()
        write("== Catálogo ==")
        write(f"Artistas: {artists.count()}")
        write(f"Discos: {albums.count()}")
        write(f"Canciones: {Song.objects.count()}")

        hidden = Counter(Song.objects.filter(hidden=True).values_list("hidden_reason", flat=True))
        write(f"Canciones ocultas: {sum(hidden.values())}" + "".join(f" | {reason or 'a mano'}: {n}" for reason, n in hidden.items()))

        write("\n== Lo que falta ==")
        write(f"Discos sin género: {albums.filter(genre='').count()} de {albums.count()}")
        write(f"Discos sin año: {albums.filter(year__isnull=True).count()} de {albums.count()}")
        write(f"Discos sin portada: {albums.filter(cover_art_url='').count()} de {albums.count()}")
        missing = songs.filter(duration_seconds__isnull=True).count()
        write(f"Canciones sin duración: {missing} de {songs.count()}")
        write(f"Canciones sin género (por el de su disco): {songs.filter(album__genre='').count()} de {songs.count()}")
        write(f"Artistas sin discos: {artists.annotate(n=Count('albums')).filter(n=0).count()}")
        write(f"Artistas sin emparejar con Deezer: {artists.filter(deezer_id__isnull=True).count()}")
        write(f"Artistas sin usuario de Instagram: {artists.filter(instagram_handle='').count()}")

        write("\n== Lo que limpiaría clean_catalog ==")
        titles = Counter()
        for artist_id, title in songs.values_list("album__artist_id", "title"):
            key = base_title(title)
            if key:
                titles[(artist_id, key)] += 1
        repeated = sum(n - 1 for n in titles.values() if n > 1)
        write(f"Canciones repetidas (mismo artista y título): {repeated} en {sum(1 for n in titles.values() if n > 1)} grupos")
        write(f"Canciones de discos clásicos: {songs.filter(album__genre__iexact='classical').count()}")
        spellings = Counter(g.strip() for g in albums.exclude(genre="").values_list("genre", flat=True))
        by_key = {}
        for spelling, count in spellings.items():
            by_key.setdefault(spelling.lower(), []).append(f"{spelling} ({count})")
        mixed = {k: v for k, v in by_key.items() if len(v) > 1}
        write(f"Géneros escritos de varias formas: {len(mixed)}")
        for options in list(mixed.values())[:10]:
            write("  " + ", ".join(options))
        top = Counter(g.strip().lower() for g in albums.exclude(genre="").values_list("genre", flat=True)).most_common(8)
        write("Géneros más comunes: " + ", ".join(f"{g} ({n})" for g, n in top))
