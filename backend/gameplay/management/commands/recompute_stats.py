from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from gameplay.models import GuessAttempt
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
        self.stdout.write(
            self.style.SUCCESS(f"Estadísticas recalculadas: {len(user_ids)} cuentas y {len(devices)} dispositivos.")
        )
