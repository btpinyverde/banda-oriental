from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.human import HasHumanPass

from battles.access import can_create
from battles.privacy import erase_user

from .authentication import BearerTokenAuthentication
from .claim import claim_device_games, device_id_from
from .emails import send_already_registered, send_confirmation, send_magic_link, send_password_reset
from .models import AuthToken, EmailChallenge, Profile
from gameplay.models import GuessAttempt, ScoreEntry

from .users import (
    apply_public_name,
    find_user,
    is_confirmed,
    mark_confirmed,
    matches_pending_password,
    record_consent,
    set_news_opt_in,
)
from .limits import TOO_MANY, can_send_email, clear_login_failures, login_locked, register_login_failure
from .serializers import (
    EmailSerializer,
    LoginSerializer,
    MagicRequestSerializer,
    RegisterSerializer,
    ResetConfirmSerializer,
    TokenSerializer,
)

User = get_user_model()

REGISTER_DETAIL = "Si el correo es válido, te enviamos un mensaje para continuar."
BAD_LINK = {"detail": "El enlace no es válido o venció."}


def start_session(request, user) -> str:
    """Opens a session and brings along the games played on this device before signing in."""
    claim_device_games(user, device_id_from(request))
    return AuthToken.issue(user)


class PublicView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class RegisterView(PublicView):
    throttle_scope = "send-email"
    permission_classes = [HasHumanPass]
    def post(self, request):
        data = RegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email, password = data.validated_data["email"], data.validated_data["password"]

        # Hashed exactly once on every path, so the response time doesn't reveal whether the email has an account.
        password_hash = make_password(password)

        # Always the same answer, whether or not the email already has an account.
        user, created = self._get_or_create(email)
        has_account = not created and is_confirmed(user)
        if not user.is_active or not can_send_email(email, new_address=not has_account):
            pass  # blocked by the admin, or over the sending limit: no mail, same answer
        elif has_account:
            EmailChallenge.issue(email, EmailChallenge.NOTICE)  # so it counts against the limit
            send_already_registered(email)
        else:
            # New, or still unconfirmed: send the link. The account itself gets NO usable password, so whoever
            # registered the email first can't keep one: the chosen password waits on the link, and confirming it
            # (reading that mailbox) is what applies it.
            send_confirmation(
                email,
                EmailChallenge.issue(
                    email,
                    EmailChallenge.CONFIRM,
                    password_hash,
                    new_address=True,
                    accepts_news=data.validated_data["accepts_news"],
                    public_name=data.validated_data["public_name"].strip(),
                ),
            )
        return Response({"detail": REGISTER_DETAIL}, status=status.HTTP_202_ACCEPTED)

    @staticmethod
    def _get_or_create(email):
        existing = find_user(email)
        if existing:
            return existing, False
        try:
            with transaction.atomic():
                return User.objects.create_user(email, email, None), True
        except IntegrityError:
            # Another request created it between our check and our insert.
            return find_user(email), False


class ConfirmView(PublicView):
    throttle_scope = "auth"
    def post(self, request):
        data = TokenSerializer(data=request.data)
        if not data.is_valid():
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        challenge = EmailChallenge.consume(data.validated_data["token"], EmailChallenge.CONFIRM)
        user = find_user(challenge.email) if challenge else None
        if user is None or not user.is_active:
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        if not is_confirmed(user):
            if challenge.password_hash:
                user.password = challenge.password_hash
                user.save(update_fields=["password"])
            mark_confirmed(user)
            record_consent(user, challenge.accepts_news)
            apply_public_name(user, challenge.public_name)
        # Any other confirmation link still pending for this email is now useless; it must not work as a login.
        EmailChallenge.objects.filter(
            email=challenge.email, purpose=EmailChallenge.CONFIRM, used_at__isnull=True
        ).update(used_at=timezone.now())
        return Response({"token": start_session(request, user)})


# Checked when the email has no account, so "unknown email" takes as long as "wrong password".
_DUMMY_HASH = make_password("no-account")


class LoginView(PublicView):
    throttle_scope = "auth"
    permission_classes = [HasHumanPass]
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email, password = data.validated_data["email"], data.validated_data["password"]

        if login_locked(email):
            return Response(TOO_MANY, status=status.HTTP_429_TOO_MANY_REQUESTS)

        user = find_user(email)
        if user is None:
            check_password(password, _DUMMY_HASH)  # same cost as a real check; the result is irrelevant
            password_ok = False
        else:
            password_ok = user.check_password(password)
        if not password_ok and user is not None and user.is_active and not is_confirmed(user):
            # An unconfirmed account has no password of its own yet; the right one is whatever its pending link carries.
            if matches_pending_password(email, password):
                return Response(
                    {"detail": "Confirmá tu correo antes de entrar.", "code": "email_not_confirmed"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        if not password_ok or not user.is_active:
            register_login_failure(email)
            return Response({"detail": "Correo o contraseña incorrectos."}, status=status.HTTP_400_BAD_REQUEST)
        if not is_confirmed(user):
            return Response(
                {"detail": "Confirmá tu correo antes de entrar.", "code": "email_not_confirmed"},
                status=status.HTTP_403_FORBIDDEN,
            )
        clear_login_failures(email)
        return Response({"token": start_session(request, user)})


class LogoutView(APIView):
    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MagicRequestView(PublicView):
    throttle_scope = "send-email"
    permission_classes = [HasHumanPass]
    def post(self, request):
        data = MagicRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"]
        user = find_user(email)
        # An unknown email gets a link too: using it creates the account. Blocked accounts get nothing.
        new_address = user is None or not is_confirmed(user)
        if (user is None or user.is_active) and can_send_email(email, new_address=new_address):
            send_magic_link(
                email,
                EmailChallenge.issue(
                    email, EmailChallenge.MAGIC, new_address=new_address, accepts_news=data.validated_data["accepts_news"]
                ),
            )
        return Response({"detail": REGISTER_DETAIL}, status=status.HTTP_202_ACCEPTED)


class MagicVerifyView(PublicView):
    throttle_scope = "auth"
    def post(self, request):
        data = TokenSerializer(data=request.data)
        if not data.is_valid():
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        challenge = EmailChallenge.consume(data.validated_data["token"], EmailChallenge.MAGIC)
        if challenge is None:
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        user = find_user(challenge.email) or self._create(challenge.email)
        if not user.is_active:
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        if not is_confirmed(user):
            # What they ticked when they registered (their confirmation link is about to be cancelled) is not lost.
            accepts_news = challenge.accepts_news or EmailChallenge.objects.filter(
                email=user.username, purpose=EmailChallenge.CONFIRM, used_at__isnull=True, accepts_news=True
            ).exists()
            # Whoever registered this address first may have left a password or a session on it: the real owner
            # just proved they read the mailbox, so none of that survives. Their pending links are cancelled too.
            user.set_unusable_password()
            user.save(update_fields=["password"])
            user.auth_tokens.all().delete()
            EmailChallenge.cancel_pending(user.username, [EmailChallenge.CONFIRM])
            mark_confirmed(user)
            record_consent(user, accepts_news)  # continuing with the link accepts the Terms (the form says so)
        mark_confirmed(user)
        return Response({"token": start_session(request, user)})

    @staticmethod
    def _create(email):
        try:
            with transaction.atomic():
                return User.objects.create_user(email, email, None)  # no password until they choose one
        except IntegrityError:
            return find_user(email)


class PasswordResetRequestView(PublicView):
    throttle_scope = "send-email"
    permission_classes = [HasHumanPass]
    def post(self, request):
        data = EmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"]
        user = find_user(email)
        if user is not None and user.is_active and is_confirmed(user) and can_send_email(email):
            send_password_reset(email, EmailChallenge.issue(email, EmailChallenge.RESET))
        return Response({"detail": REGISTER_DETAIL}, status=status.HTTP_202_ACCEPTED)


class PasswordResetConfirmView(PublicView):
    throttle_scope = "auth"
    def post(self, request):
        data = ResetConfirmSerializer(data=request.data)
        # The password is checked before the link is used, so a weak one doesn't burn it.
        data.is_valid(raise_exception=True)
        challenge = EmailChallenge.consume(data.validated_data["token"], EmailChallenge.RESET)
        user = find_user(challenge.email) if challenge else None
        if user is None or not user.is_active:
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(data.validated_data["password"])
        user.save(update_fields=["password"])
        user.auth_tokens.all().delete()  # every other session ends
        EmailChallenge.cancel_pending(user.username, [EmailChallenge.MAGIC, EmailChallenge.RESET])
        mark_confirmed(user)
        return Response({"token": start_session(request, user)})


class MeView(APIView):
    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(self._body(request.user))

    def patch(self, request):
        """The person changes their mind about news by email. Nothing else about the account is changed here."""
        value = request.data.get("accepts_news") if isinstance(request.data, dict) else None
        if not isinstance(value, bool):
            return Response({"detail": "accepts_news tiene que ser verdadero o falso."}, status=status.HTTP_400_BAD_REQUEST)
        set_news_opt_in(request.user, value)
        return Response(self._body(request.user))

    @staticmethod
    def _body(user):
        profile = Profile.objects.filter(user=user).first()
        return {
            "email": user.email,
            "date_joined": user.date_joined,
            "accepts_news": bool(profile and profile.news_opt_in),
            "terms_accepted_at": profile.terms_accepted_at if profile else None,
            # So the site only shows the Battle to the accounts allowed to create one while it is being tried out.
            "can_create_battles": can_create(user),
        }

    def delete(self, request):
        """Deletes the account and everything tied to it: sessions, games, scores and emailed links."""
        user = request.user
        EmailChallenge.objects.filter(Q(email__iexact=user.email) | Q(email__iexact=user.username)).delete()
        erase_user(user)  # its name and identity out of the battles (the rest of each room keeps its ranking)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HistoryView(APIView):
    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Every day the account played, newest first. The song is only included once that day's game is over."""
        attempts = (
            GuessAttempt.objects.filter(user=request.user)
            .select_related("daily_song__song__album__artist")
            .order_by("attempt_number")
        )
        scores = {entry.daily_song_id: entry for entry in ScoreEntry.objects.filter(user=request.user)}
        days: dict[int, list[GuessAttempt]] = {}
        for attempt in attempts:
            days.setdefault(attempt.daily_song_id, []).append(attempt)

        entries = []
        for tries in days.values():
            daily = tries[0].daily_song
            winning = next((a.attempt_number for a in tries if a.is_correct), None)
            finished = winning is not None or len(tries) >= 6
            song = daily.song
            entry = scores.get(daily.id)
            entries.append(
                {
                    "day": str(daily.date),
                    "finished": finished,
                    "won": winning is not None,
                    "winning_attempt": winning,
                    "score": entry.score if entry else None,
                    "attempts": [
                        {
                            "attempt_number": a.attempt_number,
                            "guessed_text": a.guessed_text,
                            "is_correct": a.is_correct,
                            "feedback": a.feedback,
                        }
                        for a in tries
                    ],
                    "song": (
                        {
                            "title": song.title,
                            "artist": song.album.artist.name,
                            "album": song.album.name,
                            "year": song.album.year,
                        }
                        if finished
                        else None
                    ),
                }
            )
        entries.sort(key=lambda item: item["day"], reverse=True)
        return Response({"days": entries})
