import ipaddress

from django.conf import settings


def client_ip(request) -> str:
    """The visitor's address, for limits and for tying a human-check pass to who got it.

    Behind Render the connection address is the proxy's, so a limit on it would count everyone together. Cloudflare
    (Render's edge) sets `CF-Connecting-IP` to the real address and overwrites any value a client sends, so it can
    be trusted, but only when the app is really behind it: `TRUST_CLOUDFLARE_IP_HEADER` is off everywhere else, where
    the header would be one more thing a client can forge.
    """
    if settings.TRUST_CLOUDFLARE_IP_HEADER:
        raw = request.META.get("HTTP_CF_CONNECTING_IP", "").strip()
        try:
            return str(ipaddress.ip_address(raw))
        except ValueError:
            pass
    return request.META.get("REMOTE_ADDR", "")
