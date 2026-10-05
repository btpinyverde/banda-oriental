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


def min_players():
    """How many players a room needs before it can start. While the mode is restricted to a few accounts (being tried out) one is
    enough, so it can be tried alone; once it is open to everybody it takes two, because a battle of one is not a competition.
    `BATTLES["MIN_PLAYERS"]` (env BATTLE_MIN_PLAYERS) overrides both."""
    explicit = settings.BATTLES.get("MIN_PLAYERS")
    if explicit:
        return max(1, int(explicit))
    return 2 if "*" in settings.BATTLES["CREATOR_EMAILS"] else 1
