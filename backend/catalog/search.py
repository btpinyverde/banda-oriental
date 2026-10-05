"""Search that ignores accents ("vaiven" finds "Vaivén") for the admin, on PostgreSQL (the unaccent extension) and on the
SQLite used by the tests (a function registered on each connection, so both run the same code)."""

import unicodedata

from django.db import connection
from django.db.models import CharField, Func


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


class Unaccent(Func):
    function = "unaccent"
    output_field = CharField()


_postgres_has_unaccent: bool | None = None


def unaccent_available() -> bool:
    """SQLite always (registered below). PostgreSQL only if the extension exists: if not, the search still works, just
    with accents (a missing extension must never turn the admin search into an error)."""
    global _postgres_has_unaccent
    if connection.vendor != "postgresql":
        return True
    if _postgres_has_unaccent is None:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_extension WHERE extname = 'unaccent'")
            _postgres_has_unaccent = cursor.fetchone() is not None
    return _postgres_has_unaccent


def register_sqlite_unaccent(sender, connection, **kwargs):
    if connection.vendor == "sqlite":
        connection.connection.create_function("unaccent", 1, lambda value: strip_accents(value) if value else value)


def filter_by_text(queryset, text: str, fields: list[str]):
    """Keeps the rows where EVERY word of `text` appears (in any order) in at least one of `fields` (ORM paths such as
    "title" or "album__artist__name"), ignoring accents and case. Without the unaccent extension it still works, but
    matching accents."""
    from django.db.models import Q

    terms = text.split()
    if not terms:
        return queryset
    if not unaccent_available():
        for term in terms:
            query = Q()
            for path in fields:
                query |= Q(**{f"{path}__icontains": term})
            queryset = queryset.filter(query)
        return queryset
    names = {f"_text{i}": path for i, path in enumerate(fields)}
    queryset = queryset.annotate(**{name: Unaccent(path) for name, path in names.items()})
    for term in terms:
        plain = strip_accents(term)
        query = Q()
        for name in names:
            query |= Q(**{f"{name}__icontains": plain})
        queryset = queryset.filter(query)
    return queryset
