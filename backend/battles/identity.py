import secrets
from collections import namedtuple

from gameplay.ownership import is_signed_in
from gameplay.views import get_device_id

Caller = namedtuple("Caller", "user device_id")


def get_caller(request):
    return Caller(request.user if is_signed_in(request) else None, get_device_id(request))


def player_for(battle, caller):
    """The caller's player in this battle: by account with a session, by device (rows nobody owns) without one."""
    if caller.user is not None:
        return battle.players.filter(user=caller.user).first()
    return battle.players.filter(device_id=caller.device_id, user__isnull=True).first()


def is_host(battle, caller, token):
    if token and secrets.compare_digest(token.encode(), battle.host_token.encode()):
        return True
    if caller.user is not None:
        return battle.host_user_id == caller.user.pk
    return battle.host_user_id is None and bool(battle.host_device_id) and battle.host_device_id == caller.device_id


def is_member(battle, caller, token):
    return is_host(battle, caller, token) or player_for(battle, caller) is not None
