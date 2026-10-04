import logging
import math

from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle

from .clientip import client_ip

logger = logging.getLogger(__name__)
TOO_MANY_REQUESTS = "Demasiados pedidos seguidos. Esperá un momento y probá de nuevo."


class IpThrottle(SimpleRateThrottle):
    """Every API request counts against its visitor's address (the `global` rate)."""

    scope = "global"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": client_ip(request)}


class ScopedIpThrottle(ScopedRateThrottle):
    """A stricter rate for views that set `throttle_scope`, also per address (never per user: a bot can make users)."""

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": client_ip(request)}


def exception_handler(exc, context):
    """DRF's handler, with the throttle answer in Spanish and the human-check code in the body."""
    # Imported here: rest_framework.views loads the API settings, which import this module (a circular import).
    from rest_framework.views import exception_handler as drf_exception_handler

    response = drf_exception_handler(exc, context)
    if response is None:
        return response
    if isinstance(exc, Throttled):
        wait = max(1, math.ceil(exc.wait or 1))
        # So whoever runs the site can see who is hitting a limit and how often (and check the address is the real one).
        logger.warning(
            "Límite de pedidos alcanzado: %s %s desde %s", context["request"].method, context["request"].path, client_ip(context["request"])
        )
        return Response({"detail": TOO_MANY_REQUESTS, "retry_after": wait}, status=429, headers={"Retry-After": str(wait)})
    code = getattr(getattr(exc, "detail", None), "code", None)
    if code == "human_check_required":
        response.data = {"detail": str(exc.detail), "code": code}
    return response
