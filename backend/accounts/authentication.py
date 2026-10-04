from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import AuthToken, hash_token

LAST_USED_REFRESH = timedelta(hours=1)


class BearerTokenAuthentication(BaseAuthentication):
    """`Authorization: Bearer <token>`. With no header (or another scheme) the request stays anonymous."""

    def authenticate(self, request):
        parts = request.headers.get("Authorization", "").split()
        if not parts or parts[0].lower() != "bearer":
            return None
        if len(parts) != 2:
            raise AuthenticationFailed("Token inválido.")

        token = AuthToken.objects.select_related("user").filter(key_hash=hash_token(parts[1])).first()
        if token is None or not token.user.is_active or token.is_expired():
            raise AuthenticationFailed("Token inválido.")

        # Not on every request: it would turn each read into a write.
        if timezone.now() - token.last_used_at > LAST_USED_REFRESH:
            token.last_used_at = timezone.now()
            token.save(update_fields=["last_used_at"])
        return token.user, token

    def authenticate_header(self, request):
        return "Bearer"
