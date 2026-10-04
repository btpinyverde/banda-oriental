from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from gameplay.models import GuessAttempt, PlayerStats, ScoreEntry
from gameplay.stats import recompute_stats


class Command(BaseCommand):
    help = "Recomputes the saved stats of every player (account or device) from the saved attempts and scores."

    def handle(self, *args, **options):
        user_ids = set(GuessAttempt.objects.filter(user__isnull=False).values_list("user_id", flat=True))
        devices = set(GuessAttempt.objects.filter(user__isnull=True).values_list("device_id", flat=True))
        for user in get_user_model().objects.filter(pk__in=user_ids):
            recompute_stats(user=user)
        for device_id in devices:
            recompute_stats(device_id=device_id)
        kept = self._keep_old_names()
        self.stdout.write(
            self.style.SUCCESS(f"Estadísticas recalculadas: {len(user_ids)} cuentas y {len(devices)} dispositivos. Nombres de antes conservados: {kept}.")
        )

    def _keep_old_names(self) -> int:
        """Players who scored before public names existed keep the name they used, unless someone else has it already
        (whatever the case). When two old players used the same name the one who scored first keeps it; the other has
        none and chooses another the next time."""
        pending = []
        for row in PlayerStats.objects.filter(public_name__isnull=True):
            scores = ScoreEntry.objects.filter(user=row.user) if row.user_id else ScoreEntry.objects.filter(device_id=row.device_id, user__isnull=True)
            ordered = list(scores.order_by("created_at").values_list("created_at", "display_name"))
            if ordered:
                pending.append((ordered[0][0], ordered[-1][1], row))
        kept = 0
        for _, name, row in sorted(pending, key=lambda item: item[0]):
            if name and not PlayerStats.objects.filter(public_name__iexact=name).exists():
                row.public_name = name
                row.save(update_fields=["public_name"])
                kept += 1
        return kept
