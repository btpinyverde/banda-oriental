import logging
import re
import threading

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone

logger = logging.getLogger(__name__)

# AI crawlers and AI agents that identify themselves. The site is for people: they may read the landing page (see
# frontend/app/robots.ts) and nothing else. Agents that pretend to be a normal browser are what the human check is for.
AI_AGENTS = re.compile(
    r"GPTBot|ChatGPT|OAI-SearchBot|ClaudeBot|Claude-(Web|User|SearchBot)|anthropic|PerplexityBot|Perplexity-User|"
    r"CCBot|Bytespider|Amazonbot|Applebot-Extended|meta-external|FacebookBot|cohere|Diffbot|ImagesiftBot|Omgili|"
    r"YouBot|MistralAI|DuckAssistBot|Timpibot|PanguBot|Google-Extended|GoogleOther|Gemini|Manus|Operator",
    re.IGNORECASE,
)


class BlockAiAgentsMiddleware:
    """Refuses declared AI agents on the whole API, except the health check (uptime monitors)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (
            request.path.startswith("/api/")
            and not request.path.startswith("/api/health/")
            and AI_AGENTS.search(request.META.get("HTTP_USER_AGENT", ""))
        ):
            return JsonResponse({"detail": "Este sitio es solo para personas."}, status=403)
        return self.get_response(request)


def _run_purge(days: int) -> None:
    try:
        from gameplay import maintenance

        counts = maintenance.purge_inactive_anonymous(days=days)
        logger.info("Borrado de anónimos inactivos: %s", counts)
    except Exception:
        logger.exception("No se pudo borrar a los anónimos inactivos")


class DailyMaintenanceMiddleware:
    """There is no scheduler on the free hosting, so the first request of each day runs the housekeeping (deleting the
    anonymous players idle for a week) after answering. It never delays or breaks the request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        days = getattr(settings, "PURGE_ANONYMOUS_AFTER_DAYS", 0)
        if days > 0 and cache.add(f"maintenance:purge:{timezone.localdate()}", 1, 86400):
            if getattr(settings, "PURGE_IN_BACKGROUND", True):
                threading.Thread(target=_run_purge, args=(days,), daemon=True).start()
            else:
                _run_purge(days)
        return response
