"""Confiar en un perfil de Deezer solo cuando algo más que el nombre lo respalda.

Deezer se empareja por nombre, y los homónimos (otro "Fernando Cabrera", otro "AFC") traen discos ajenos. Un perfil queda
VERIFICADO si MusicBrainz o Wikidata (que se consultan por id, nunca por nombre) apuntan a ese mismo perfil, o si los discos que
conocen las dos fuentes coinciden. Lo que solo trae Deezer de un perfil sin verificar se oculta (cuarentena), sin borrar nada.
"""

import re
from dataclasses import dataclass

import requests
from django.db.models import Count, Q

from . import musicbrainz
from .models import Artist, Song

VERIFIED, UNVERIFIED, WRONG = "verificado", "sin_verificar", "equivocado"
QUARANTINE_REASON = "deezer"  # en Song.hidden_reason

# Pruebas por discos: al menos dos que conocen MusicBrainz y Deezer, y que Deezer no traiga muchos más que esos.
MIN_CONFIRMED_DISCS = 2
MAX_EXTRA_DISCS = 10
EXTRA_PROPORTION = 3

_DEEZER_ARTIST = re.compile(r"deezer\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?artist/(\d+)", re.IGNORECASE)
_WIKIDATA = re.compile(r"wikidata\.org/(?:wiki|entity)/(Q\d+)", re.IGNORECASE)
WIKIDATA_DEEZER_PROPERTY = "P2722"
WIKIDATA_TIMEOUT_SECONDS = 20


@dataclass(frozen=True)
class Verdict:
    status: str
    source: str
    suggested_id: int | None = None


def _musicbrainz_links(mbid):
    """Los enlaces externos que MusicBrainz tiene cargados para ese artista."""
    data = musicbrainz._get(f"artist/{mbid}", {"inc": "url-rels"}).json()
    return [r["url"]["resource"] for r in data.get("relations", []) if r.get("url", {}).get("resource")]


def _wikidata_deezer_ids(qid):
    response = requests.get(
        f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json",
        headers={"User-Agent": musicbrainz.USER_AGENT},
        timeout=WIKIDATA_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    claims = response.json().get("entities", {}).get(qid, {}).get("claims", {}).get(WIKIDATA_DEEZER_PROPERTY, [])
    ids = []
    for claim in claims:
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, str) and value.isdigit():
            ids.append(int(value))
    return ids


def _compare(found, deezer_id, source):
    if not found:
        return None
    if deezer_id in found:
        return Verdict(VERIFIED, source)
    return Verdict(WRONG, source, found[0])


def check_deezer_link(mbid, deezer_id):
    """¿MusicBrainz o Wikidata dicen que el perfil `deezer_id` es el de este artista? Puede lanzar un error de red."""
    links = _musicbrainz_links(mbid)
    verdict = _compare([int(m.group(1)) for m in map(_DEEZER_ARTIST.search, links) if m], deezer_id, "musicbrainz")
    if verdict:
        return verdict
    qids = [m.group(1) for m in map(_WIKIDATA.search, links) if m]
    if qids:
        verdict = _compare(_wikidata_deezer_ids(qids[0]), deezer_id, "wikidata")
        if verdict:
            return verdict
    return Verdict(UNVERIFIED, "")


def disc_evidence(artist):
    """¿Los discos de las dos fuentes coinciden lo bastante como para confiar en el perfil de Deezer?"""
    counts = artist.albums.aggregate(
        confirmed=Count("id", filter=Q(mbid__isnull=False, deezer_id__isnull=False)),
        only_deezer=Count("id", filter=Q(mbid__isnull=True, deezer_id__isnull=False)),
    )
    confirmed, extra = counts["confirmed"], counts["only_deezer"]
    return confirmed >= MIN_CONFIRMED_DISCS and not (extra >= MAX_EXTRA_DISCS and extra >= EXTRA_PROPORTION * confirmed)


def _quarantined_songs(artists=None):
    """Las canciones que solo trae Deezer (disco sin MusicBrainz) de artistas con perfil no verificado, sin las de algún día del juego."""
    from gameplay.models import DailySong

    scope = artists if artists is not None else Artist.objects.all()
    return (
        Song.objects.filter(album__artist__in=scope.filter(deezer_id__isnull=False).exclude(deezer_status=VERIFIED))
        .filter(album__mbid__isnull=True, album__deezer_id__isnull=False)
        .exclude(pk__in=DailySong.objects.values("song_id"))
    )


def hide_unverified(artists=None, apply=True):
    """Oculta (con motivo, reversible) lo que solo trae Deezer de perfiles sin verificar. Devuelve cuántas canciones."""
    songs = _quarantined_songs(artists).filter(hidden=False)
    count = songs.count()
    if apply and count:
        Song.objects.filter(pk__in=list(songs.values_list("pk", flat=True))).update(hidden=True, hidden_reason=QUARANTINE_REASON)
    return count


def restore_quarantine(artists=None):
    """Vuelve a mostrar lo que ocultó la cuarentena (lo ocultado a mano o por otra limpieza no se toca)."""
    queryset = Song.objects.filter(hidden=True, hidden_reason=QUARANTINE_REASON)
    if artists is not None:
        queryset = queryset.filter(album__artist__in=artists)
    count = queryset.count()
    queryset.update(hidden=False, hidden_reason="")
    return count
