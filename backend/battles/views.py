from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import BearerTokenAuthentication
from core.human import HasHumanPass

from . import services, state
from .identity import get_caller, is_host, player_for
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
    # No human check and no global limit: a whole bar joins from one address, and the human pass is capped at 30 an hour per
    # address. What protects a room is its secret code, the cap of players and the scoped rate.
    skip_global_throttle = True
    permission_classes = []
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


class DetailView(APIView):
    throttle_scope = "battle-state"
    skip_global_throttle = True  # polling: a bar's phones share one address and have their own, higher limit
    authentication_classes = [BearerTokenAuthentication]

    def get(self, request, code):
        caller = get_caller(request)
        battle = get_object_or_404(Battle, code=code.upper())
        data = state.build_state(battle, caller, request.headers.get("X-Host-Token", ""), request.query_params.get("since", ""), timezone.now())
        if data is None:
            raise Http404
        return Response(data)


class AnswerView(APIView):
    throttle_scope = "battle-answer"
    skip_global_throttle = True  # every phone in the room answers from the same address
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request, code):
        caller = get_caller(request)
        battle = get_object_or_404(Battle, code=code.upper())
        if is_host(battle, caller, request.headers.get("X-Host-Token", "")):
            raise Http404  # whoever organizes does not play
        player = player_for(battle, caller)
        if player is None:
            raise Http404
        services.submit_answer(battle, player, request.data.get("song_id"), timezone.now())
        return Response({"received": True})


class MineView(APIView):
    throttle_scope = "battle-state"
    skip_global_throttle = True
    authentication_classes = [BearerTokenAuthentication]

    def get(self, request):
        return Response({"battles": services.my_battles(get_caller(request))})
