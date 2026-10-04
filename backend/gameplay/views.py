import math
import uuid
from datetime import date

from catalog.models import Song
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import BearerTokenAuthentication

from .feedback import calculate_feedback
from .models import DailySong, GuessAttempt, ScoreEntry, Stem
from .moderation import contains_banned_word
from .ownership import owner_fields, owner_filter
from core.human import HasHumanPass
from .scoring import calculate_score


def get_device_id(request):
    raw_device_id = request.headers.get("X-Device-Id", "").strip()
    if not raw_device_id:
        raise ValidationError({"device_id": "The X-Device-Id header is required."})
    try:
        # Validates it's actually a UUID (the frontend generates one in
        # localStorage per spec §9) and, as a side effect, bounds its
        # length — an unvalidated overlong header previously overflowed
        # GuessAttempt/ScoreEntry.device_id's varchar(64) in production.
        return str(uuid.UUID(raw_device_id))
    except ValueError:
        raise ValidationError({"device_id": "The X-Device-Id header must be a UUID."})


def song_payload(song):
    """A catalog song with what the guess table shows, same shape as /api/songs/."""
    return {
        "id": song.id,
        "title": song.title,
        "artist": song.album.artist.name,
        "album": song.album.name,
        "year": song.album.year,
        "genre": song.album.genre,
    }


class DailyView(APIView):
    # Optional session: without the header the game works by device, as before. A bad token is a 401.
    authentication_classes = [BearerTokenAuthentication]

    def get(self, request):
        device_id = get_device_id(request)
        daily_song = DailySong.objects.filter(
            date=timezone.localdate(), state=DailySong.PUBLISHED
        ).first()
        if daily_song is None:
            return Response({"detail": "No hay canción publicada para hoy."}, status=404)

        owner = owner_filter(request, device_id)
        score = ScoreEntry.objects.filter(owner, daily_song=daily_song).first()
        if score is not None:
            return self._finished_response(daily_song, won=True, score=score)

        attempts = list(
            GuessAttempt.objects.filter(owner, daily_song=daily_song)
            .select_related("guessed_song__album__artist")
            .order_by("attempt_number")
        )
        if any(attempt.is_correct for attempt in attempts):
            # A win doesn't create a ScoreEntry by itself (that's a
            # separate, later call — see GuessView's matching check) — so
            # without this, a device that won but hasn't submitted its
            # score yet would see an in-progress game here while
            # GuessView rejects every further guess from it, stranding
            # the player. Checked before the "6 attempts" branch below so
            # a win on the 6th attempt is never mistaken for a loss.
            return self._finished_response(daily_song, won=True, score=None)

        if len(attempts) >= 6:
            # Six failed attempts and no ScoreEntry means the device lost
            # today — spec §6 says a lost game reveals the answer, same as
            # a win does, just with no score.
            return self._finished_response(daily_song, won=False, score=None)

        attempt_number = len(attempts) + 1
        rank = Stem.UNLOCK_RANK
        stems = sorted(
            (stem for stem in daily_song.stems.all() if rank[stem.stem_type] <= attempt_number),
            key=lambda stem: rank[stem.stem_type],
        )

        return Response(
            {
                "day": str(daily_song.date),
                "attempt_number": attempt_number,
                "attempts_remaining": 6 - len(attempts),
                "unlocked_stems": [
                    {"stem_type": stem.stem_type, "unlock_order": rank[stem.stem_type], "url": stem.audio_file.url}
                    for stem in stems
                ],
                "feedback_history": [
                    {
                        "attempt_number": a.attempt_number,
                        "feedback": a.feedback,
                        "guessed_text": a.guessed_text,
                        "guessed_song": song_payload(a.guessed_song) if a.guessed_song else None,
                    }
                    for a in attempts
                ],
                "finished": False,
            }
        )

    def _finished_response(self, daily_song, *, won, score):
        body = {
            "day": str(daily_song.date),
            "finished": True,
            "won": won,
            "score_submitted": score is not None,
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
    throttle_scope = "guess"
    permission_classes = [HasHumanPass]
    # Optional session: without the header the game works by device, as before. A bad token is a 401.
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request):
        device_id = get_device_id(request)
        daily_song = DailySong.objects.filter(
            date=timezone.localdate(), state=DailySong.PUBLISHED
        ).first()
        if daily_song is None:
            return Response({"detail": "No hay canción publicada para hoy."}, status=404)

        owner = owner_filter(request, device_id)
        if ScoreEntry.objects.filter(owner, daily_song=daily_song).exists():
            return Response({"detail": "Ya jugaste hoy."}, status=400)

        device_attempts = GuessAttempt.objects.filter(owner, daily_song=daily_song)
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

        try:
            # Own savepoint, same reasoning as ScoreView: without it, a
            # caught IntegrityError still leaves the outer transaction
            # unusable for any later query in this request/response.
            with transaction.atomic():
                GuessAttempt.objects.create(
                    **owner_fields(request),
                    device_id=device_id,
                    daily_song=daily_song,
                    attempt_number=attempt_number,
                    guessed_text=guessed_song.title,
                    guessed_song=guessed_song,
                    is_correct=is_correct,
                    feedback=feedback,
                )
        except IntegrityError:
            # The existing_attempts count above has the same race as
            # ScoreView's .exists() check: two near-simultaneous requests
            # can both pass it before either row is committed. The
            # UniqueConstraint on GuessAttempt is the real backstop.
            return Response({"detail": "Número de intento inválido."}, status=400)

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
    throttle_scope = "score"
    permission_classes = [HasHumanPass]
    # Optional session: without the header the game works by device, as before. A bad token is a 401.
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request):
        device_id = get_device_id(request)
        daily_song = DailySong.objects.filter(
            date=timezone.localdate(), state=DailySong.PUBLISHED
        ).first()
        if daily_song is None:
            return Response({"detail": "No hay canción publicada para hoy."}, status=404)

        owner = owner_filter(request, device_id)
        if ScoreEntry.objects.filter(owner, daily_song=daily_song).exists():
            return Response({"detail": "Ya enviaste tu puntaje de hoy."}, status=400)

        winning_attempt_obj = (
            GuessAttempt.objects.filter(owner, daily_song=daily_song, is_correct=True)
            .order_by("attempt_number")
            .first()
        )
        if winning_attempt_obj is None:
            return Response({"detail": "Todavía no ganaste hoy."}, status=400)

        raw_display_name = request.data.get("display_name")
        if not isinstance(raw_display_name, str):
            return Response({"detail": "Nombre inválido."}, status=400)
        display_name = raw_display_name.strip()
        max_length = ScoreEntry._meta.get_field("display_name").max_length
        if not display_name or len(display_name) > max_length or contains_banned_word(display_name):
            return Response({"detail": "Nombre inválido."}, status=400)

        try:
            total_time_seconds = float(request.data.get("total_time_seconds"))
        except (TypeError, ValueError):
            return Response({"detail": "total_time_seconds inválido."}, status=400)
        # float("nan")/float("inf") both succeed above without raising —
        # math.isfinite is the only thing that actually catches them, and
        # a negative value (clock skew, bad data) is never meaningful here.
        if not math.isfinite(total_time_seconds) or total_time_seconds < 0:
            return Response({"detail": "total_time_seconds inválido."}, status=400)

        score = calculate_score(winning_attempt_obj.attempt_number, total_time_seconds)

        try:
            # The inner atomic() gives this its own savepoint: without
            # it, catching IntegrityError still leaves the connection's
            # outer transaction unusable for any query run afterward
            # (confirmed empirically — a bare try/except here raised
            # TransactionManagementError on the very next query).
            with transaction.atomic():
                entry = ScoreEntry.objects.create(
                    **owner_fields(request),
                    device_id=device_id,
                    daily_song=daily_song,
                    display_name=display_name,
                    score=score,
                    winning_attempt=winning_attempt_obj.attempt_number,
                    total_time_seconds=total_time_seconds,
                )
        except IntegrityError:
            # The .exists() check above has a race: two near-simultaneous
            # requests can both pass it before either row is committed.
            # The UniqueConstraint on ScoreEntry is the real backstop —
            # this just turns its IntegrityError into the same clean 400
            # the plan requires, instead of an unhandled 500.
            return Response({"detail": "Ya enviaste tu puntaje de hoy."}, status=400)
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
        try:
            parsed_fecha = date.fromisoformat(fecha)
        except ValueError:
            # An invalid or malformed date isn't a server error — it's
            # just a day that doesn't exist, same as a well-formed date
            # with no published DailySong. Spec §9 expects these archive
            # URLs to be crawled, so a mistyped one must 404, not 500.
            return Response({"detail": "Día no encontrado."}, status=404)

        today = timezone.localdate()
        daily_song = DailySong.objects.filter(
            date=parsed_fecha, state=DailySong.PUBLISHED, date__lt=today
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
