from datetime import timedelta

from django.urls import reverse

from battles import services
from battles.models import Battle, BattlePlayer
from .conftest import D2, D3, HOST, STRANGER, at


def mine(client, device, **extra):
    r = client.get(reverse("battles:mine"), HTTP_X_DEVICE_ID=device, **extra)
    assert r.status_code == 200
    return r.json()["battles"]


def test_the_host_sees_the_battle_as_host(client, running):
    rows = mine(client, HOST)
    assert [(r["code"], r["role"], r["players_count"]) for r in rows] == [(running.code, "host", 2)]
    assert rows[0]["my_position"] is None


def test_a_player_sees_it_with_the_final_position(client, running, clock):
    right = running.rounds.get(index=0).song_id
    ana = running.players.get(display_name="Ana")
    services.submit_answer(running, ana, right, at(6))
    clock(500)
    client.get(reverse("battles:detail", args=[running.code]), HTTP_X_DEVICE_ID=D2)  # the poll that closes it
    rows = mine(client, D2)
    assert rows[0]["role"] == "player" and rows[0]["status"] == "finished" and rows[0]["my_position"] == 1
    assert rows[0]["players_count"] == 2  # everybody in the room, not only the caller's own row
    assert mine(client, D3)[0]["my_position"] == 2


def test_nobody_else_sees_anything(client, running):
    assert mine(client, STRANGER) == []


def test_a_finished_battle_is_not_found_for_who_did_not_take_part(client, running, clock):
    clock(500)
    client.get(reverse("battles:detail", args=[running.code]), HTTP_X_DEVICE_ID=D2)
    assert client.get(reverse("battles:detail", args=[running.code]), HTTP_X_DEVICE_ID=STRANGER).status_code == 404


def test_newest_first_and_at_most_fifty(client, db):
    for i in range(55):
        Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST, title=f"B{i}")
    rows = mine(client, HOST)
    assert len(rows) == 50 and rows[0]["title"] == "B54"


def test_with_an_account_it_follows_across_devices_and_without_one_it_does_not(client, db, django_user_model):
    from accounts.models import AuthToken

    user = django_user_model.objects.create_user(username="u", email="u@x.uy", password="x" * 12)
    b = Battle.objects.create(round_count=3, round_seconds=10, host_user=user)
    BattlePlayer.objects.create(battle=b, user=user, display_name="Ana")
    auth = {"HTTP_AUTHORIZATION": f"Bearer {AuthToken.issue(user)}"}
    assert [r["code"] for r in mine(client, STRANGER, **auth)] == [b.code]
    assert mine(client, STRANGER) == []
