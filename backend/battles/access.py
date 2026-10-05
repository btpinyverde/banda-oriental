from django.conf import settings


def can_create(user):
    """Whether this visitor may create battles. Joining and playing are open to whoever has a room's code; creating is
    limited to the accounts in `BATTLES["CREATOR_EMAILS"]` while the mode is being tried out. A "*" opens it to everybody,
    anonymous visitors included: that is the switch for the public launch."""
    allowed = settings.BATTLES["CREATOR_EMAILS"]
    if "*" in allowed:
        return True
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return (user.email or "").strip().lower() in allowed
