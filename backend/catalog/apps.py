from django.apps import AppConfig


class CatalogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "catalog"

    def ready(self):
        from django.db.backends.signals import connection_created

        from . import signals  # noqa: F401
        from .search import register_sqlite_unaccent

        connection_created.connect(register_sqlite_unaccent)
