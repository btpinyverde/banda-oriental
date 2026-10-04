"""
Carga el catálogo uruguayo desde MusicBrainz mostrando todo lo que pasa.

Reutiliza las funciones del backend (catalog/musicbrainz.py y catalog/coverartarchive.py) sin modificarlas.
A diferencia del comando `sync_musicbrainz`, guarda disco por disco (no artista por artista) y avisa de
cada paso, así se ve el avance y no se pierde nada si se corta.

Uso (lo llama scripts/cargar-catalogo.sh):
    python scripts/cargar_catalogo.py [--sin-portadas] [--max-artistas N]
"""
import argparse
import os
import sys
import time
from pathlib import Path

import django

RAIZ = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(RAIZ))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
django.setup()

import requests  # noqa: E402
from django.db import transaction  # noqa: E402

from catalog.coverartarchive import get_cover_art_url  # noqa: E402
from catalog.models import Album, Artist, Song, SyncState  # noqa: E402
from catalog.musicbrainz import (  # noqa: E402
    get_album_release_groups,
    get_release_for_release_group,
    get_tracklist,
    search_uruguayan_artists,
)

TANDA = 25
REINTENTOS = 4


def log(mensaje=""):
    print(f"[{time.strftime('%H:%M:%S')}] {mensaje}", flush=True)


def con_reintentos(descripcion, funcion, *args):
    """Si falla la red o MusicBrainz, espera y reintenta en vez de abandonar al artista."""
    for intento in range(1, REINTENTOS + 1):
        try:
            return funcion(*args)
        except (requests.RequestException, ValueError) as error:
            if intento == REINTENTOS:
                raise
            espera = 10 * intento
            log(f"    ! {descripcion} falló ({type(error).__name__}); reintento {intento}/{REINTENTOS - 1} en {espera}s")
            time.sleep(espera)


def totales():
    return f"{Artist.objects.count()} artistas, {Album.objects.count()} discos, {Song.objects.count()} canciones"


def cargar_disco(artista, datos, portadas):
    release = con_reintentos("buscar edición", get_release_for_release_group, datos["mbid"])
    existente = Album.objects.filter(mbid=datos["mbid"]).first()

    portada = ""
    if portadas and release and release["has_cover_art"]:
        portada = get_cover_art_url(release["mbid"])

    # Igual que el importador del backend: un dato que falta ahora no pisa uno bueno ya guardado.
    anio = datos["year"] if datos["year"] is not None else (existente.year if existente else None)
    genero = datos["genre"] or (existente.genre if existente else "")
    portada = portada or (existente.cover_art_url if existente else "")

    canciones = con_reintentos("buscar canciones", get_tracklist, release["mbid"]) if release else []

    with transaction.atomic():
        disco, _ = Album.objects.update_or_create(
            mbid=datos["mbid"],
            defaults={"name": datos["title"], "artist": artista, "year": anio, "genre": genero, "cover_art_url": portada},
        )
        for pista in canciones:
            Song.objects.update_or_create(
                mbid=pista["mbid"],
                defaults={"title": pista["title"], "album": disco, "duration_seconds": pista["duration_seconds"]},
            )
    return len(canciones), bool(portada)


def cargar_artista(datos, portadas):
    artista, _ = Artist.objects.update_or_create(mbid=datos["mbid"], defaults={"name": datos["name"]})
    discos = con_reintentos("buscar discos", get_album_release_groups, artista.mbid)
    log(f"  {len(discos)} disco(s) de estudio")
    for n, disco in enumerate(discos, 1):
        try:
            canciones, con_portada = cargar_disco(artista, disco, portadas)
            log(f"    ({n}/{len(discos)}) {disco['title']} [{disco['year'] or 's/año'}] → {canciones} canciones{' + portada' if con_portada else ''}")
        except Exception as error:  # un disco roto no debe frenar al resto
            log(f"    ({n}/{len(discos)}) {disco['title']} → SALTEADO ({type(error).__name__}: {error})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sin-portadas", action="store_true", help="no consultar tapas (mucho más rápido)")
    parser.add_argument("--max-artistas", type=int, default=0, help="parar después de N artistas (para probar)")
    opciones = parser.parse_args()
    portadas = not opciones.sin_portadas

    estado = SyncState.get_solo()
    log(f"Base de datos: {django.db.connection.settings_dict.get('HOST') or 'local'} · {totales()}")
    log(f"Empiezo desde el artista nº {estado.musicbrainz_offset}{' (sin portadas)' if not portadas else ''}")

    procesados = 0
    while True:
        artistas, total = con_reintentos("buscar artistas", search_uruguayan_artists, estado.musicbrainz_offset, TANDA)
        if not artistas:
            break
        for datos in artistas:
            log(f"[{estado.musicbrainz_offset + 1}/{total}] {datos['name']}")
            try:
                cargar_artista(datos, portadas)
            except Exception as error:
                log(f"  ARTISTA SALTEADO ({type(error).__name__}: {error})")
            procesados += 1
            siguiente = estado.musicbrainz_offset + 1
            estado.musicbrainz_offset = siguiente if siguiente < total else 0
            estado.save()
            log(f"  Totales: {totales()}")
            if estado.musicbrainz_offset == 0:
                log("Listo: se recorrieron todos los artistas.")
                return
            if opciones.max_artistas and procesados >= opciones.max_artistas:
                log("Paro acá (--max-artistas).")
                return


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Cortado. Lo guardado queda; al volver a correr sigue desde el último artista.")
