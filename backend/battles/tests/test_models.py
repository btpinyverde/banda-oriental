import pytest
from django.db import IntegrityError, transaction

from battles.models import Battle, BattlePlayer

DEVICE = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def battle(db):
    return Battle.objects.create(round_count=5, round_seconds=20, host_device_id=DEVICE)


def test_battle_gets_a_readable_code_and_a_host_token(battle):
    assert len(battle.code) == 6
    assert battle.code == battle.code.upper()
    assert not set(battle.code) & set("ILO01")  # no look-alike characters
    assert len(battle.host_token) >= 24
    assert battle.status == Battle.LOBBY
    assert battle.version == 1


def test_codes_are_unique(db):
    codes = {Battle.objects.create(round_count=3, round_seconds=10, host_device_id=DEVICE).code for _ in range(30)}
    assert len(codes) == 30


def test_display_name_is_unique_in_a_battle_ignoring_case(battle):
    BattlePlayer.objects.create(battle=battle, device_id=DEVICE, display_name="Juan")
    with pytest.raises(IntegrityError), transaction.atomic():
        BattlePlayer.objects.create(battle=battle, device_id="22222222-2222-2222-2222-222222222222", display_name="juan")


def test_same_name_is_fine_in_another_battle(battle):
    other = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=DEVICE)
    BattlePlayer.objects.create(battle=battle, device_id=DEVICE, display_name="Juan")
    BattlePlayer.objects.create(battle=other, device_id=DEVICE, display_name="Juan")


def test_a_device_joins_a_battle_only_once(battle):
    BattlePlayer.objects.create(battle=battle, device_id=DEVICE, display_name="Juan")
    with pytest.raises(IntegrityError), transaction.atomic():
        BattlePlayer.objects.create(battle=battle, device_id=DEVICE, display_name="Otro")
