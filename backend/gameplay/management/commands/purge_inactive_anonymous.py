from django.core.management.base import BaseCommand

from gameplay.maintenance import purge_inactive_anonymous


class Command(BaseCommand):
    help = "Deletes the anonymous players (no account) that have not played for N days. Never touches accounts."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=7)
        parser.add_argument("--dry-run", action="store_true", help="Only report what would be deleted.")

    def handle(self, *args, days, dry_run, **options):
        counts = purge_inactive_anonymous(days=days, dry_run=dry_run)
        verb = "Se borrarían" if dry_run else "Se borraron"
        self.stdout.write(
            self.style.SUCCESS(
                f"{verb} {counts['devices']} jugadores anónimos inactivos "
                f"({counts['attempts']} intentos, {counts['scores']} puntajes, {counts['stats']} estadísticas)."
            )
        )
