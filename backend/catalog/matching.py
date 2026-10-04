"""Reglas puras (sin red ni base de datos) para unir lo que trae Deezer con lo que ya tenemos."""
import re
import unicodedata

# Tipos de lanzamiento que nos interesan. Los compilados ("compile") repiten canciones de otros discos.
WANTED_RECORD_TYPES = {"album", "ep", "single"}

# Versiones que no son la grabación original de estudio. Se buscan como palabras sueltas, así que
# "Alive" o "Remixeros" no se confunden con "live" o "remix".
_UNWANTED_VERSION = re.compile(r"\b(en vivo|live|remix|remixes|karaoke|instrumental)\b")

# "Vivo" suelto es una palabra común en títulos ("Estoy vivo"): solo cuenta si es toda una marca entre paréntesis.
_LIVE_IN_BRACKETS = re.compile(r"[\(\[]\s*(en )?vivo\s*[\)\]]")

_EDITION_WORDS = "deluxe|remaster|remasterizad|edition|edicion|expanded|bonus|anniversary|aniversario"
_EDITION_IN_BRACKETS = re.compile(rf"\s*[\(\[][^\)\]]*({_EDITION_WORDS})[^\)\]]*[\)\]]")
_EDITION_AFTER_DASH = re.compile(rf"\s+-\s+[^-]*({_EDITION_WORDS})[^-]*$")


def _strip_accents(text):
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def normalize_text(text):
    """Minúsculas, sin tildes ni signos, con un solo espacio entre palabras."""
    lowered = _strip_accents(text or "").lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", lowered).split())


def pick_artist(candidates, wanted_name):
    """El candidato de Deezer que se llama exactamente igual (sin contar tildes ni mayúsculas).

    Nunca adivina: un nombre parecido o un perfil sin discos devuelve None, y se revisa a mano. Un artista
    mal emparejado carga discos ajenos; uno sin emparejar solo queda pendiente.
    """
    target = normalize_text(wanted_name)
    exact = [c for c in candidates if normalize_text(c["name"]) == target and c.get("nb_album", 0) > 0]
    if not exact:
        return None
    return max(exact, key=lambda c: (c.get("nb_album", 0), c.get("nb_fan", 0)))


def is_wanted_release(title, record_type):
    if record_type not in WANTED_RECORD_TYPES:
        return False
    plain = _strip_accents(title or "").lower()
    return not (_UNWANTED_VERSION.search(normalize_text(title)) or _LIVE_IN_BRACKETS.search(plain))


def base_title(title):
    """El título sin sufijos de edición ("Deluxe", "Remastered 2010"), normalizado.

    Sirve para reconocer que "Eco" y "Eco (Deluxe Edition)" son el mismo disco.
    """
    plain = _strip_accents(title or "").lower()
    plain = _EDITION_IN_BRACKETS.sub("", plain)
    plain = _EDITION_AFTER_DASH.sub("", plain)
    return normalize_text(plain)
