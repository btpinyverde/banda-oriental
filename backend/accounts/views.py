from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import BearerTokenAuthentication
from .emails import send_already_registered, send_confirmation
from .models import AuthToken, EmailChallenge
from .serializers import LoginSerializer, RegisterSerializer, TokenSerializer

User = get_user_model()

REGISTER_DETAIL = "Si el correo es válido, te enviamos un mensaje para continuar."
BAD_LINK = {"detail": "El enlace no es válido o venció."}


def find_user(email):
    return User.objects.filter(username=email).first()


class PublicView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class RegisterView(PublicView):
    def post(self, request):
        data = RegisterSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email, password = data.validated_data["email"], data.validated_data["password"]

        # Hashed exactly once on every path, so the response time doesn't reveal whether the email has an account.
        password_hash = make_password(password)

        # Always the same answer, whether or not the email already has an account.
        user, created = self._get_or_create(email, password_hash)
        if not created and user.is_active:
            send_already_registered(email)
        else:
            # New, or still unconfirmed: send the link. The password is stored with the link, not on the account:
            # confirming applies it, so whoever registered the email first can't keep a password of their own.
            send_confirmation(email, EmailChallenge.issue(email, EmailChallenge.CONFIRM, password_hash))
        return Response({"detail": REGISTER_DETAIL}, status=status.HTTP_202_ACCEPTED)

    @staticmethod
    def _get_or_create(email, password_hash):
        existing = find_user(email)
        if existing:
            return existing, False
        try:
            with transaction.atomic():
                return User.objects.create(username=email, email=email, password=password_hash, is_active=False), True
        except IntegrityError:
            # Another request created it between our check and our insert.
            return find_user(email), False


class ConfirmView(PublicView):
    def post(self, request):
        data = TokenSerializer(data=request.data)
        if not data.is_valid():
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        challenge = EmailChallenge.consume(data.validated_data["token"], EmailChallenge.CONFIRM)
        user = find_user(challenge.email) if challenge else None
        if user is None:
            return Response(BAD_LINK, status=status.HTTP_400_BAD_REQUEST)
        if not user.is_active:
            if challenge.password_hash:
                user.password = challenge.password_hash
            user.is_active = True
            user.save(update_fields=["password", "is_active"])
        # Any other confirmation link still pending for this email is now useless; it must not work as a login.
        EmailChallenge.objects.filter(
            email=challenge.email, purpose=EmailChallenge.CONFIRM, used_at__isnull=True
        ).update(used_at=timezone.now())
        return Response({"token": AuthToken.issue(user)})


# Checked when the email has no account, so "unknown email" takes as long as "wrong password".
_DUMMY_HASH = make_password("no-account")


class LoginView(PublicView):
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email, password = data.validated_data["email"], data.validated_data["password"]

        user = find_user(email)
        if user is None:
            check_password(password, _DUMMY_HASH)  # same cost as a real check; the result is irrelevant
            password_ok = False
        else:
            password_ok = user.check_password(password)
        if not password_ok:
            return Response({"detail": "Correo o contraseña incorrectos."}, status=status.HTTP_400_BAD_REQUEST)
        if not user.is_active:
            return Response(
                {"detail": "Confirmá tu correo antes de entrar.", "code": "email_not_confirmed"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response({"token": AuthToken.issue(user)})


class LogoutView(APIView):
    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"email": request.user.email, "date_joined": request.user.date_joined})
