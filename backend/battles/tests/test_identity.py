import pytest

from battles.identity import Caller, is_host, is_member, player_for
from battles.models import Battle, BattlePlayer

D1 = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def battle(db):
    return Battle.objects.create(round_count=3, round_seconds=10, host_device_id=D1)


def test_anonymous_player_is_found_by_device(battle):
    p = BattlePlayer.objects.create(battle=battle, device_id=D2, display_name="Ana")
    assert player_for(battle, Caller(None, D2)) == p
    assert player_for(battle, Caller(None, D1)) is None


def test_signed_in_player_is_found_by_account_and_not_by_device_alone(battle, django_user_model):
    user = django_user_model.objects.create_user(username="u", email="u@x.uy", password="x" * 12)
    p = BattlePlayer.objects.create(battle=battle, user=user, device_id="", display_name="Ana")
    assert player_for(battle, Caller(user, "33333333-3333-3333-3333-333333333333")) == p
    assert player_for(battle, Caller(None, "33333333-3333-3333-3333-333333333333")) is None


def test_host_by_token_or_by_device(battle):
    assert is_host(battle, Caller(None, D2), battle.host_token)
    assert is_host(battle, Caller(None, D1), "")
    assert not is_host(battle, Caller(None, D2), "wrong-token")
    assert not is_host(battle, Caller(None, D2), "")


def test_membership_is_host_or_player(battle):
    BattlePlayer.objects.create(battle=battle, device_id=D2, display_name="Ana")
    assert is_member(battle, Caller(None, D2), "")
    assert is_member(battle, Caller(None, D1), "")
    assert not is_member(battle, Caller(None, "44444444-4444-4444-4444-444444444444"), "")
