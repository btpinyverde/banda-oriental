from django.db import migrations, transaction


def enable_unaccent(apps, schema_editor):
    """The admin song search ignores accents with PostgreSQL's unaccent extension. If it cannot be created here (not the
    owner of the database, for instance) nothing breaks: the search falls back to matching accents (catalog/search.py)."""
    if schema_editor.connection.vendor != "postgresql":
        return
    try:
        with transaction.atomic():
            schema_editor.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    except Exception:  # noqa: BLE001 - see above
        pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0003_deezer_ids")]

    operations = [migrations.RunPython(enable_unaccent, migrations.RunPython.noop)]
