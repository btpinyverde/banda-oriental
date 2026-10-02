from django.db import migrations


def create_singleton(apps, schema_editor):
    SyncState = apps.get_model("catalog", "SyncState")
    SyncState.objects.get_or_create(pk=1)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_singleton, noop_reverse),
    ]
