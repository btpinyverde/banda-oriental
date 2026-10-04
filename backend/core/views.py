from django.db import InterfaceError, OperationalError, connection
from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from .clientip import client_ip
from .human import issue_pass, required, verify_turnstile


class HealthView(APIView):
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except (OperationalError, InterfaceError):
            return Response({"status": "error", "db": "unreachable"}, status=503)
        return Response({"status": "ok", "db": "ok"})


class HumanView(APIView):
    """Trades a solved Cloudflare Turnstile challenge for a pass the game and the account forms ask for."""

    authentication_classes = []
    permission_classes = []
    throttle_scope = "human"

    def post(self, request):
        token = request.data.get("token") if isinstance(request.data, dict) else None
        if not isinstance(token, str) or not token or len(token) > 2048:
            return Response({"detail": "No pudimos comprobar que sos una persona. Probá de nuevo."}, status=400)
        if not required():
            return Response({"pass": "", "required": False})
        if not verify_turnstile(token, client_ip(request)):
            return Response({"detail": "No pudimos comprobar que sos una persona. Probá de nuevo."}, status=400)
        return Response({"pass": issue_pass(request), "expires_in": settings.HUMAN_PASS_TTL_SECONDS})
