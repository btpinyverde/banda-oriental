from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import BearerTokenAuthentication
from core.human import HasHumanPass

from . import services
from .identity import get_caller


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
