from catalog.models import Song
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .feedback import calculate_feedback
from .models import DailySong, GuessAttempt, ScoreEntry
from .moderation import contains_banned_word
from .scoring import calculate_score


def get_device_id(request):
    device_id = request.headers.get("X-Device-Id", "").strip()
    if not device_id:
        raise ValidationError({"device_id": "The X-Device-Id header is required."})
    return device_id


class DailyView(APIView):
    def get(self, request):
        device_id = get_device_id(request)
        daily_song = DailySong.objects.filter(
            date=timezone.localdate(), state=DailySong.PUBLISHED
        ).first()
        if daily_song is None:
            return Response({"detail": "No hay canción publicada para hoy."}, status=404)

        score = ScoreEntry.objects.filter(device_id=device_id, daily_song=daily_song).first()
        if score is not None:
            return self._finished_response(daily_song, won=True, score=score)

        attempts = list(
            GuessAttempt.objects.filter(device_id=device_id, daily_song=daily_song).order_by(
                "attempt_number"
            )
        )
        if len(attempts) >= 6:
            # Six failed attempts and no ScoreEntry means the device lost
            # today — spec §6 says a lost game reveals the answer, same as
            # a win does, just with no score.
            return self._finished_response(daily_song, won=False, score=None)

        attempt_number = len(attempts) + 1
        stems = daily_song.stems.filter(unlock_order__lte=attempt_number).order_by("unlock_order")

        return Response(
            {
                "day": str(daily_song.date),
                "attempt_number": attempt_number,
                "attempts_remaining": 6 - len(attempts),
                "unlocked_stems": [
                    {"stem_type": stem.stem_type, "unlock_order": stem.unlock_order, "url": stem.audio_file.url}
                    for stem in stems
                ],
                "feedback_history": [
                    {"attempt_number": a.attempt_number, "feedback": a.feedback} for a in attempts
                ],
                "finished": False,
            }
        )

    def _finished_response(self, daily_song, *, won, score):
        body = {
            "day": str(daily_song.date),
            "finished": True,
            "won": won,
            "song": {
                "title": daily_song.song.title,
                "artist": daily_song.song.album.artist.name,
                "album": daily_song.song.album.name,
            },
        }
        if score is not None:
            body["score"] = score.score
            body["winning_attempt"] = score.winning_attempt
        return Response(body)


class GuessView(APIView):
    def post(self, request):
        device_id = get_device_id(request)
        daily_song = DailySong.objects.filter(
            date=timezone.localdate(), state=DailySong.PUBLISHED
        ).first()
        if daily_song is None:
            return Response({"detail": "No hay canción publicada para hoy."}, status=404)

        if ScoreEntry.objects.filter(device_id=device_id, daily_song=daily_song).exists():
            return Response({"detail": "Ya jugaste hoy."}, status=400)

        device_attempts = GuessAttempt.objects.filter(device_id=device_id, daily_song=daily_song)
        # A win doesn't create a ScoreEntry by itself — that's a separate
        # call the frontend makes afterward (Task 6) — so without this
        # check, a device could keep guessing after already winning, in
        # the window before it submits its score.
        if device_attempts.filter(is_correct=True).exists():
            return Response({"detail": "Ya jugaste hoy."}, status=400)

        existing_attempts = device_attempts.count()
        if existing_attempts >= 6:
            return Response({"detail": "No te quedan intentos."}, status=400)

        attempt_number = request.data.get("attempt_number")
        if attempt_number != existing_attempts + 1:
            return Response({"detail": "Número de intento inválido."}, status=400)

        try:
            guessed_song = Song.objects.select_related("album__artist").get(
                pk=request.data.get("song_id")
            )
        except (Song.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Canción no encontrada."}, status=400)

        is_correct = guessed_song.id == daily_song.song_id
        feedback = calculate_feedback(guessed_song, daily_song.song)

        GuessAttempt.objects.create(
            device_id=device_id,
            daily_song=daily_song,
            attempt_number=attempt_number,
            guessed_text=guessed_song.title,
            is_correct=is_correct,
            feedback=feedback,
        )

        finished = is_correct or attempt_number == 6
        return Response(
            {
                "is_correct": is_correct,
                "attempt_number": attempt_number,
                "feedback": feedback,
                "finished": finished,
                "attempts_remaining": 6 - attempt_number,
            }
        )


class ScoreView(APIView):
    def post(self, request):
        device_id = get_device_id(request)
        daily_song = DailySong.objects.filter(
            date=timezone.localdate(), state=DailySong.PUBLISHED
        ).first()
        if daily_song is None:
            return Response({"detail": "No hay canción publicada para hoy."}, status=404)

        if ScoreEntry.objects.filter(device_id=device_id, daily_song=daily_song).exists():
            return Response({"detail": "Ya enviaste tu puntaje de hoy."}, status=400)

        winning_attempt_obj = (
            GuessAttempt.objects.filter(device_id=device_id, daily_song=daily_song, is_correct=True)
            .order_by("attempt_number")
            .first()
        )
        if winning_attempt_obj is None:
            return Response({"detail": "Todavía no ganaste hoy."}, status=400)

        display_name = (request.data.get("display_name") or "").strip()
        if not display_name or contains_banned_word(display_name):
            return Response({"detail": "Nombre inválido."}, status=400)

        try:
            total_time_seconds = float(request.data.get("total_time_seconds"))
        except (TypeError, ValueError):
            return Response({"detail": "total_time_seconds inválido."}, status=400)

        score = calculate_score(winning_attempt_obj.attempt_number, total_time_seconds)

        entry = ScoreEntry.objects.create(
            device_id=device_id,
            daily_song=daily_song,
            display_name=display_name,
            score=score,
            winning_attempt=winning_attempt_obj.attempt_number,
            total_time_seconds=total_time_seconds,
        )
        return Response(
            {
                "score": entry.score,
                "winning_attempt": entry.winning_attempt,
                "display_name": entry.display_name,
            },
            status=201,
        )


class LeaderboardTodayView(APIView):
    def get(self, request):
        today = timezone.localdate()
        daily_song = DailySong.objects.filter(date=today, state=DailySong.PUBLISHED).first()
        entries = []
        if daily_song is not None:
            entries = [
                {
                    "display_name": entry.display_name,
                    "score": entry.score,
                    "winning_attempt": entry.winning_attempt,
                }
                for entry in ScoreEntry.objects.filter(daily_song=daily_song).order_by("-score")
            ]
        return Response({"day": str(today), "entries": entries})


class ArchiveListView(APIView):
    def get(self, request):
        today = timezone.localdate()
        days = DailySong.objects.filter(state=DailySong.PUBLISHED, date__lt=today).order_by("-date")
        return Response(
            {
                "days": [
                    {"date": str(day.date), "song_title": day.song.title, "artist": day.song.album.artist.name}
                    for day in days
                ]
            }
        )


class ArchiveDetailView(APIView):
    def get(self, request, fecha):
        today = timezone.localdate()
        daily_song = DailySong.objects.filter(
            date=fecha, state=DailySong.PUBLISHED, date__lt=today
        ).first()
        if daily_song is None:
            return Response({"detail": "Día no encontrado."}, status=404)

        song = daily_song.song
        return Response(
            {
                "date": str(daily_song.date),
                "song_title": song.title,
                "artist": song.album.artist.name,
                "album": song.album.name,
                "artist_instagram_handle": song.album.artist.instagram_handle,
            }
        )
