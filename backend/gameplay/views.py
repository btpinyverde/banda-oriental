from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DailySong, GuessAttempt, ScoreEntry


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
