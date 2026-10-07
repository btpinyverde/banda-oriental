import math
import uuid
from datetime import date

from catalog.models import Song
import logging
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import FloatField, Sum
from django.db.models.functions import Cast, Lower
from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import BearerTokenAuthentication
from accounts.claim import device_id_from

from .feedback import calculate_feedback
from .models import DailySong, GuessAttempt, PlayerStats, ScoreEntry, Stem
from .moderation import contains_banned_word
from .ownership import owner_fields, owner_filter
from core.human import HasHumanPass
from .scoring import calculate_score
from . import leaderboards
from .stats import owner_of, recompute_stats, serialize


logger = logging.getLogger(__name__)

LEADERBOARD_LIMIT = 50
LEADERBOARD_PAGE_MAX = 50  # most rows a page of the ranking can ask for
ACCURACY_MIN_GAMES = 3  # fewer games than this and a perfect percentage is luck, not accuracy


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
                    {
                        "stem_type": stem.stem_type,
                        "unlock_order": rank[stem.stem_type],
                        "url": stem.playable_url,
                        "variants": stem.versions(),
                    }
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
        if finished:
            try:
                recompute_stats(**owner_of(request, device_id))
            except Exception:
                # The attempt is already saved; stats are recomputed from the attempts, so the next game fixes this.
                logger.exception("No se pudieron actualizar las estadísticas")
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

        stats_owner = owner_of(request, device_id)
        stored = PlayerStats.objects.filter(**({"user": request.user} if "user" in stats_owner else {"user": None, "device_id": device_id})).first()
        if stored is not None and stored.public_name:
            # The public name is chosen once; later scores always carry it, whatever the client sends.
            display_name = stored.public_name
        else:
            raw_display_name = request.data.get("display_name")
            if not isinstance(raw_display_name, str):
                return Response({"detail": "Nombre inválido."}, status=400)
            display_name = raw_display_name.strip()
            max_length = PlayerStats._meta.get_field("public_name").max_length
            if not display_name or len(display_name) > max_length or contains_banned_word(display_name):
                return Response({"detail": "Nombre inválido."}, status=400)
            if PlayerStats.objects.filter(public_name__iexact=display_name).exists():
                return Response({"detail": "Ese nombre ya está en uso. Elegí otro."}, status=400)

        try:
            total_time_seconds = float(request.data.get("total_time_seconds"))
        except (TypeError, ValueError):
            return Response({"detail": "total_time_seconds inválido."}, status=400)
        # float("nan")/float("inf") both succeed above without raising —
        # math.isfinite is the only thing that actually catches them, and
        # a negative value (clock skew, bad data) is never meaningful here.
        if not math.isfinite(total_time_seconds) or total_time_seconds < 0:
            return Response({"detail": "total_time_seconds inválido."}, status=400)

        # The client's clock can say anything; what the server saw between the first and the winning attempt is a
        # floor the time cannot go under.
        first_attempt = GuessAttempt.objects.filter(owner, daily_song=daily_song).order_by("attempt_number").first()
        observed = (winning_attempt_obj.created_at - first_attempt.created_at).total_seconds()
        total_time_seconds = max(total_time_seconds, observed)

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
                row = recompute_stats(**stats_owner)
                if not row.public_name:
                    row.public_name = display_name
                    row.save(update_fields=["public_name"])
                elif row.public_name != display_name:
                    # The name was changed between reading it and saving the score: the score carries the new one
                    # (the old one is free for anyone to take).
                    entry.display_name = display_name = row.public_name
                    entry.save(update_fields=["display_name"])
        except IntegrityError:
            # Two things can collide: today's score (the .exists() check above has a race, and the UniqueConstraint
            # on ScoreEntry is the real backstop) or the public name (someone took it a moment ago).
            if ScoreEntry.objects.filter(owner, daily_song=daily_song).exists():
                return Response({"detail": "Ya enviaste tu puntaje de hoy."}, status=400)
            return Response({"detail": "Ese nombre ya está en uso. Elegí otro."}, status=400)
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


class StatsView(APIView):
    """The player's own stats, as the server calculated and saved them. Read-only: nothing here accepts stats."""

    http_method_names = ["get", "head", "options"]
    authentication_classes = [BearerTokenAuthentication]

    def get(self, request):
        device_id = get_device_id(request)
        owner = owner_of(request, device_id)
        lookup = {"user": owner["user"]} if "user" in owner else {"user": None, "device_id": device_id}
        row = PlayerStats.objects.filter(**lookup).first()
        # The stats change when a game ends, but a streak also drops just by days going by without playing. A row
        # saved on an earlier day is recomputed when read (once a day at most); someone who never played has no row
        # and reading never creates one.
        if row is not None and timezone.localtime(row.updated_at).date() < timezone.localdate():
            row = recompute_stats(**owner)
        return Response(serialize(row))


class LeaderboardView(APIView):
    """Rankings of the day, the week (Monday to Sunday), the month and all time. Public and read-only; the optional
    session or X-Device-Id adds the caller's own position (`me`), even if it is outside the top."""

    http_method_names = ["get", "head", "options"]
    authentication_classes = [BearerTokenAuthentication]

    def get(self, request):
        period = request.query_params.get("period")
        if period not in leaderboards.PERIODS:
            return Response({"detail": "period debe ser day, week, month o all."}, status=400)
        me_key = None
        if request.user is not None and request.user.is_authenticated:
            me_key = ("u", request.user.id)
        else:
            device_id = device_id_from(request)
            if device_id:
                me_key = ("d", device_id)
        # Asking for a page (the ranking page scrolls) gives that page; without it, the top as always.
        paged = "page" in request.query_params or "page_size" in request.query_params
        page = self._number(request.query_params.get("page"), default=1, highest=10_000)
        size = self._number(request.query_params.get("page_size"), default=LEADERBOARD_LIMIT, highest=LEADERBOARD_PAGE_MAX) if paged else LEADERBOARD_LIMIT
        return Response(leaderboards.build(period, timezone.localdate(), limit=size, page=page, me_key=me_key))

    @staticmethod
    def _number(raw, *, default, highest):
        try:
            return min(max(int(raw), 1), highest)
        except (TypeError, ValueError):
            return default


class PublicNameView(APIView):
    """Changes the public name a player appears with in the rankings. Same rules as when it was chosen (word filter,
    unique whatever the case), a wait between changes, and never creates a player: the name is first chosen with the
    first score."""

    throttle_scope = "name"
    permission_classes = [HasHumanPass]
    authentication_classes = [BearerTokenAuthentication]
    http_method_names = ["put", "options"]

    def put(self, request):
        device_id = get_device_id(request)
        owner = owner_of(request, device_id)
        lookup = {"user": owner["user"]} if "user" in owner else {"user": None, "device_id": device_id}
        with transaction.atomic():
            # The row is locked until the end so two requests at once (or a rename and a score) are ordered.
            row = PlayerStats.objects.select_for_update().filter(**lookup).first()
            return self._change(request, row)

    def _change(self, request, row):
        if row is None or not row.public_name:
            return Response(
                {"detail": "Todavía no elegiste un nombre: se elige al guardar tu primer puntaje."}, status=400
            )

        raw = request.data.get("public_name") if isinstance(request.data, dict) else None
        if not isinstance(raw, str):
            return Response({"detail": "Nombre inválido."}, status=400)
        name = raw.strip()
        max_length = PlayerStats._meta.get_field("public_name").max_length
        if not name or len(name) > max_length or contains_banned_word(name):
            return Response({"detail": "Nombre inválido."}, status=400)
        if name == row.public_name:
            return Response(serialize(row))  # nothing to change, and the wait does not start

        wait_days = settings.PUBLIC_NAME_CHANGE_COOLDOWN_DAYS
        if wait_days > 0 and row.name_changed_at is not None:
            next_change = row.name_changed_at + timedelta(days=wait_days)
            if timezone.now() < next_change:
                return Response(
                    {
                        "detail": f"Podés cambiar tu nombre una vez cada {wait_days} días. "
                        f"El próximo cambio es el {timezone.localtime(next_change):%d/%m}.",
                        "code": "name_change_too_soon",
                    },
                    status=400,
                )
        if PlayerStats.objects.exclude(pk=row.pk).filter(public_name__iexact=name).exists():
            return Response({"detail": "Ese nombre ya está en uso. Elegí otro."}, status=400)

        try:
            with transaction.atomic():
                row.public_name = name
                row.name_changed_at = timezone.now()
                row.save(update_fields=["public_name", "name_changed_at"])
                scores = ScoreEntry.objects.filter(user=row.user) if row.user_id else ScoreEntry.objects.filter(
                    device_id=row.device_id, user__isnull=True
                )
                scores.update(display_name=name)  # the daily list shows what each score was saved with
        except IntegrityError:
            return Response({"detail": "Ese nombre ya está en uso. Elegí otro."}, status=400)
        return Response(serialize(row))


class LeaderboardHighlightsView(APIView):
    """The side lists of the ranking page: the best current streaks, the best accuracy and who has played the most songs, top five of each.
    Public and read-only; only players with a public name and at least one game."""

    http_method_names = ["get", "head", "options"]
    throttle_scope = "songs"

    def get(self, request):
        named = PlayerStats.objects.filter(public_name__isnull=False, played__gt=0)

        def top(field):
            rows = named.filter(**{f"{field}__gt": 0}).order_by(f"-{field}", Lower("public_name"))[:5]
            return [{"display_name": row.public_name, "value": getattr(row, field)} for row in rows]

        # Accuracy is the share of games won; someone with very few games would top it by luck, so a minimum applies.
        by_accuracy = (
            named.filter(played__gte=ACCURACY_MIN_GAMES, won__gt=0)
            .annotate(share=Cast("won", FloatField()) / Cast("played", FloatField()))
            .order_by("-share", "-played", Lower("public_name"))[:5]
        )
        accuracy = [{"display_name": row.public_name, "value": round(row.won * 100 / row.played)} for row in by_accuracy]

        response = Response({"streaks": top("current_streak"), "songs": top("played"), "accuracy": accuracy})
        response["Cache-Control"] = "public, max-age=60"
        return response


class GlobalStatsView(APIView):
    """Numbers of the whole game for the ranking page: players, games finished and days the game has had."""

    http_method_names = ["get", "head", "options"]
    throttle_scope = "songs"

    def get(self, request):
        players = PlayerStats.objects.filter(played__gt=0)
        response = Response(
            {
                "players": players.count(),
                "games": players.aggregate(total=Sum("played"))["total"] or 0,
                "days": DailySong.objects.filter(state=DailySong.PUBLISHED, date__lte=timezone.localdate()).count(),
            }
        )
        response["Cache-Control"] = "public, max-age=60"
        return response
