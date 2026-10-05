from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import BearerTokenAuthentication
from core.human import HasHumanPass

from . import services
from .identity import get_caller, is_host
from .models import Battle


def lobby_battle_or_404(code):
    # A battle that is not in its lobby (or does not exist) is "not found": the code only serves to join.
    return get_object_or_404(Battle, code=code.upper(), status=Battle.LOBBY)


class CreateView(APIView):
    throttle_scope = "battle-create"
    permission_classes = [HasHumanPass]
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request):
        caller = get_caller(request)
        battle = services.create_battle(
            caller,
            round_count=request.data.get("round_count"),
            round_seconds=request.data.get("round_seconds"),
            title=request.data.get("title"),
        )
        return Response(
            {"code": battle.code, "host_token": battle.host_token, "round_count": battle.round_count, "round_seconds": battle.round_seconds, "title": battle.title},
            status=201,
        )


class JoinView(APIView):
    throttle_scope = "battle-join"
    permission_classes = [HasHumanPass]
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request, code):
        caller = get_caller(request)
        battle = lobby_battle_or_404(code)
        player, created = services.join_battle(
            battle, caller, request.data.get("display_name"), request.headers.get("X-Host-Token", "")
        )
        return Response({"player": {"name": player.display_name}}, status=201 if created else 200)


class StartView(APIView):
    throttle_scope = "battle-join"
    permission_classes = [HasHumanPass]
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request, code):
        caller = get_caller(request)
        battle = lobby_battle_or_404(code)
        if not is_host(battle, caller, request.headers.get("X-Host-Token", "")):
            raise Http404
        services.start_battle(battle)
        return Response({"status": Battle.PLAYING})
