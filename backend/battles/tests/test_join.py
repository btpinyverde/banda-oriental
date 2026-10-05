import pytest
from django.urls import reverse

from battles.models import Battle

HOST = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"
D3 = "33333333-3333-3333-3333-333333333333"


@pytest.fixture
def battle(db):
    return Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)


def join(client, battle, name="Ana", device=D2, code=None):
    return client.post(
        reverse("battles:join", args=[code or battle.code]), data={"display_name": name}, content_type="application/json", HTTP_X_DEVICE_ID=device
    )


def test_a_player_joins_and_the_version_goes_up(client, battle):
    r = join(client, battle)
    assert r.status_code == 201
    assert r.json()["player"]["name"] == "Ana"
    battle.refresh_from_db()
    assert battle.version == 2 and battle.players.count() == 1


def test_joining_again_is_idempotent_and_keeps_the_name(client, battle):
    join(client, battle, "Ana")
    r = join(client, battle, "Otro nombre")
    assert r.status_code == 200 and r.json()["player"]["name"] == "Ana"
    assert battle.players.count() == 1


def test_the_name_is_unique_in_the_battle_ignoring_case(client, battle):
    join(client, battle, "Ana")
    r = join(client, battle, "ana", device=D3)
    assert r.status_code == 400 and "Elegí otro" in str(r.json())


@pytest.mark.parametrize("name", ["", "   ", "x" * 51, "a\x00b", 5, None])
def test_invalid_names_are_rejected(client, battle, name):
    assert join(client, battle, name).status_code == 400


def test_banned_words_are_rejected(client, battle, monkeypatch):
    monkeypatch.setattr("battles.services.contains_banned_word", lambda t: True)
    assert join(client, battle).status_code == 400


def test_the_host_cannot_join_his_own_battle(client, battle):
    assert join(client, battle, device=HOST).status_code == 400


def test_unknown_or_started_battle_is_not_found(client, battle):
    assert join(client, battle, code="ZZZZZZ").status_code == 404
    battle.status = Battle.PLAYING
    battle.save()
    assert join(client, battle).status_code == 404


def test_full_battle_is_refused(client, battle, settings):
    settings.BATTLES = {**settings.BATTLES, "MAX_PLAYERS": 1}
    join(client, battle, "Ana")
    r = join(client, battle, "Beto", device=D3)
    assert r.status_code == 400 and "llena" in str(r.json())
