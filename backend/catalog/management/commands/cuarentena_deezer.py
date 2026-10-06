from django.core.management.base import BaseCommand, CommandError

from catalog import verification as v
from catalog.models import Artist


class Command(BaseCommand):
    help = (
        "Quarantine for what only Deezer brought of a profile nobody vouches for (see verificar_deezer): those songs are HIDDEN, "
        "never deleted, and the songs of any day of the game are never touched. Dry run unless --aplicar; --restaurar shows them "
        "again. Run verificar_deezer first."
    )

    def add_arguments(self, parser):
        parser.add_argument("--aplicar", action="store_true", help="really do it (without this flag it only reports)")
        parser.add_argument("--restaurar", action="store_true", help="show again what the quarantine hid")

    def handle(self, *args, **options):
        apply = options["aplicar"]
        if not apply:
            self.stdout.write("Modo prueba: no se cambia nada (agregá --aplicar para guardar).")
        if options["restaurar"]:
            count = v.restore_quarantine() if apply else v.Song.objects.filter(hidden=True, hidden_reason=v.QUARANTINE_REASON).count()
            self.stdout.write(f"Se {'restauraron' if apply else 'restaurarían'} {count} canciones.")
            return
        pending = Artist.objects.filter(deezer_id__isnull=False, deezer_status="").count()
        if pending:
            raise CommandError(f"Hay {pending} artistas sin revisar: corré primero verificar_deezer (si no, se pondría en cuarentena a ciegas).")
        count = v.hide_unverified(apply=apply)
        artists = Artist.objects.filter(deezer_id__isnull=False).exclude(deezer_status=v.VERIFIED).count()
        self.stdout.write(f"Se {'ocultaron' if apply else 'ocultarían'} {count} canciones que solo trae Deezer, de {artists} artistas con el perfil sin verificar.")
