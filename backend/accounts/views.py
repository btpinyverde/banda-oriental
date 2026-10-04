from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import BearerTokenAuthentication
from .emails import send_already_registered, send_confirmation
from .models import AuthToken, EmailChallenge
from .serializers import RegisterSerializer, TokenSerializer

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

        # Always the same answer, whether or not the email already has an account.
        user, created = self._get_or_create(email, password)
        if not created and user.is_active:
            send_already_registered(email)
        else:
            # New, or still unconfirmed: send the link. An existing unconfirmed account keeps its old password,
            # otherwise anyone could set the password of an account before its owner confirms it.
            send_confirmation(email, EmailChallenge.issue(email, EmailChallenge.CONFIRM))
        return Response({"detail": REGISTER_DETAIL}, status=status.HTTP_202_ACCEPTED)

    @staticmethod
    def _get_or_create(email, password):
        existing = find_user(email)
        if existing:
            return existing, False
        try:
            with transaction.atomic():
                return User.objects.create_user(email, email, password, is_active=False), True
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
            user.is_active = True
            user.save(update_fields=["is_active"])
        return Response({"token": AuthToken.issue(user)})


class MeView(APIView):
    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"email": request.user.email, "date_joined": request.user.date_joined})
