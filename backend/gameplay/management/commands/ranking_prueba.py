import uuid

from django.core.management.base import BaseCommand
from django.utils import timezone

from gameplay import leaderboards
from gameplay.models import DailySong, ScoreEntry

PREFIX = "[prueba]"
# Fixed namespace: the same test player always has the same device id, so creating twice adds nothing and deleting finds
# exactly the ones created here (and never a real player, whatever name they chose).
NAMESPACE = uuid.UUID("5d0b1c6e-7f64-4c52-9a53-0d2c9e2d7a11")
PLAYERS = [("Ana", 940, 1), ("Beto", 880, 2), ("Cata", 810, 2), ("Dani", 730, 3), ("Eli", 640, 4), ("Fede", 520, 5)]
DAYS = 3  # the last published days: enough for the day, week, month and all-time rankings to have data


def test_device_ids() -> list[str]:
    return [str(uuid.uuid5(NAMESPACE, name)) for name, _, _ in PLAYERS]


class Command(BaseCommand):
    help = (
        "Looks at the scores saved and the rankings as the API builds them. With --crear it adds clearly marked test scores "
        f"(names start with '{PREFIX}') to the last published days; with --borrar it removes exactly those. Real data is never touched."
    )

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group()
        group.add_argument("--crear", action="store_true", help="Add the test scores (once; running it again adds nothing).")
        group.add_argument("--borrar", action="store_true", help="Remove the test scores created by --crear.")

    def handle(self, *args, crear, borrar, **options):
        if crear:
            self._create()
        elif borrar:
            self._delete()
        self._report()

    def _published_days(self):
        return list(DailySong.objects.filter(state=DailySong.PUBLISHED, date__lte=timezone.localdate()).order_by("-date")[:DAYS])

    def _create(self):
        days = self._published_days()
        if not days:
            self.stdout.write("No hay ningún día publicado: no se creó nada.")
            return
        created = 0
        for daily in days:
            for (name, score, attempt), device_id in zip(PLAYERS, test_device_ids(), strict=True):
                _, was_created = ScoreEntry.objects.get_or_create(
                    device_id=device_id,
                    user=None,
                    daily_song=daily,
                    defaults={
                        "display_name": f"{PREFIX} {name}",
                        "score": score,
                        "winning_attempt": attempt,
                        "total_time_seconds": 20.0 + attempt * 7,
                    },
                )
                created += was_created
        self.stdout.write(self.style.SUCCESS(f"Creados {created} puntajes de prueba en {len(days)} días."))

    def _delete(self):
        deleted, _ = ScoreEntry.objects.filter(user__isnull=True, device_id__in=test_device_ids()).delete()
        self.stdout.write(self.style.SUCCESS(f"Borrados {deleted} puntajes de prueba."))

    def _report(self):
        today = timezone.localdate()
        total = ScoreEntry.objects.count()
        tests = ScoreEntry.objects.filter(user__isnull=True, device_id__in=test_device_ids()).count()
        self.stdout.write(f"\nPuntajes guardados: {total} ({tests} de prueba, {total - tests} reales)")
        published = list(DailySong.objects.filter(state=DailySong.PUBLISHED).order_by("-date")[:5])
        if not published:
            self.stdout.write("No hay ningún día publicado: sin canción del día nadie puede jugar ni guardar puntaje.")
        for daily in published:
            self.stdout.write(f"  {daily.date}: {daily.scores.count()} puntajes")
        if not DailySong.objects.filter(date=today, state=DailySong.PUBLISHED).exists() and published:
            self.stdout.write(f"  (hoy, {today}, no hay canción publicada)")
        for period in leaderboards.PERIODS:
            ranking = leaderboards.build(period, today, limit=3)
            self.stdout.write(f"\nRanking {period} ({ranking['from']} → {ranking['to']}): {len(ranking['entries'])} mostrados")
            for row in ranking["entries"]:
                self.stdout.write(f"  {row['rank']}. {row['display_name']} — {row['score']} pts ({row['games']} partidas)")
