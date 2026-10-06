from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import BearerTokenAuthentication
from core.human import HasHumanPass

from . import services, state
from . import youtube
from .access import can_create
from .filters import clean_filters, pool
from .identity import get_caller, is_host, player_for
from gameplay.views import song_payload

from .models import Battle


def lobby_battle_or_404(code):
    # A battle that is not in its lobby (or does not exist) is "not found": the code only serves to join.
    return get_object_or_404(Battle, code=code.upper(), status=Battle.LOBBY)


class CreateView(APIView):
    throttle_scope = "battle-create"
    permission_classes = [HasHumanPass]
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request):
        if not can_create(request.user):
            raise Http404  # not "forbidden": whoever may not create does not need to know the mode is there
        caller = get_caller(request)
        battle = services.create_battle(
            caller,
            round_count=request.data.get("round_count"),
            round_seconds=request.data.get("round_seconds"),
            title=request.data.get("title"),
            audio_mode=request.data.get("audio_mode"),
            join_mode=request.data.get("join_mode"),
            songs_mode=request.data.get("songs_mode"),
            filters=request.data.get("filters"),
            playlist=request.data.get("playlist"),
            team_mode=request.data.get("team_mode"),
            team_count=request.data.get("team_count"),
            team_names=request.data.get("team_names"),
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
        return Response({"player": {"name": player.display_name, "status": player.status}}, status=201 if created else 200)


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
        if player is None or player.status != player.ACCEPTED:
            raise Http404
        services.submit_answer(battle, player, request.data.get("song_id"), timezone.now())
        return Response({"received": True})


class MineView(APIView):
    throttle_scope = "battle-state"
    skip_global_throttle = True
    authentication_classes = [BearerTokenAuthentication]

    def get(self, request):
        return Response({"battles": services.my_battles(get_caller(request))})


class ReviewView(APIView):
    throttle_scope = "battle-join"
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request, code):
        caller = get_caller(request)
        battle = lobby_battle_or_404(code)
        if not is_host(battle, caller, request.headers.get("X-Host-Token", "")):
            raise Http404
        services.review_player(battle, request.data.get("player_id"), request.data.get("accept"))
        return Response({"ok": True})


class PoolView(APIView):
    """How many songs a segment has, so the organizer sees whether it is enough before creating the room."""

    throttle_scope = "catalog"
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request):
        if not can_create(request.user):
            raise Http404
        return Response({"count": pool(clean_filters(request.data.get("filters"))).count()})


class YoutubeView(APIView):
    """Reads a YouTube link: its id, its title and the catalog songs it could be (the answer is always a catalog song)."""

    throttle_scope = "catalog"
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request):
        if not can_create(request.user):
            raise Http404
        found = youtube.lookup(request.data.get("url"))
        return Response(
            {
                "youtube_id": found["youtube_id"],
                "title": found["title"],
                "author": found["author"],
                "suggestions": [song_payload(s) for s in found["songs"]],
            }
        )


class TeamView(APIView):
    throttle_scope = "battle-join"
    authentication_classes = [BearerTokenAuthentication]

    def post(self, request, code):
        caller = get_caller(request)
        battle = lobby_battle_or_404(code)
        if not is_host(battle, caller, request.headers.get("X-Host-Token", "")):
            raise Http404
        services.assign_team(battle, request.data.get("player_id"), request.data.get("team_id"))
        return Response({"ok": True})


class AccessView(APIView):
    """Whether the visitor may create battles. It answers to everybody (anonymous included) and never hides itself, so the site can
    decide what to show: the create form, or a message saying the battles are still being tried out."""

    throttle_scope = "battle-state"
    skip_global_throttle = True
    authentication_classes = [BearerTokenAuthentication]

    def get(self, request):
        return Response({"can_create": can_create(request.user)})
