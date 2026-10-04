import re

from django.http import JsonResponse

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
