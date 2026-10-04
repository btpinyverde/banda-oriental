from django.conf import settings
from django.db import InterfaceError, OperationalError, connection
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods
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


def _wants_json(request) -> bool:
    accept = request.headers.get("Accept", "")
    return "application/json" in accept and "text/html" not in accept


@require_http_methods(["GET", "HEAD"])
def root(request):
    """What anyone sees at the address of the API: a page that says what it is and where the game is (instead of an
    error). A program asking for JSON gets the same in JSON. Search engines are asked to leave it out."""
    if _wants_json(request):
        response = JsonResponse(
            {
                "name": "Banda Oriental API",
                "mensaje": "¿Qué pretende usted de mí?",
                "status": "ok",
                "site": settings.FRONTEND_URL,
                "health": "/api/health/",
            }
        )
    else:
        response = render(request, "core/raiz.html")
    response["X-Robots-Tag"] = "noindex, nofollow"
    return response


@require_http_methods(["GET", "HEAD"])
def robots(request):
    return HttpResponse("User-agent: *\nDisallow: /\n", content_type="text/plain; charset=utf-8")


def not_found(request, exception=None):
    """404 for addresses that no route matches: JSON for the API, a branded page for a person with a browser."""
    if request.path.startswith("/api/"):
        return JsonResponse({"detail": "No encontrado."}, status=404)
    return render(request, "404.html", status=404)
