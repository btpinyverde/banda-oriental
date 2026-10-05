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
