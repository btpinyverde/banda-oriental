import pytest
from django.urls import reverse

from battles.models import Battle
from .conftest import D2, HOST, STRANGER


def get(client, battle, device, since=None):
    url = reverse("battles:detail", args=[battle.code]) + (f"?since={since}" if since else "")
    return client.get(url, HTTP_X_DEVICE_ID=device)


def test_the_correct_song_is_not_sent_before_the_round_ends(client, running, clock):
    clock(10)  # round 0 is playing: 5..15
    r = get(client, running, D2).json()
    assert r["phase"] == {"name": "playing", "index": 0}
    assert "reveal" not in r
    assert r["round"]["preview_url"].startswith("https://cdn/")
    assert "song" not in r["round"]


def test_countdown_before_the_first_round(client, running, clock):
    clock(1)
    r = get(client, running, D2).json()
    assert r["phase"]["name"] == "countdown" and r["round"]["index"] == 0


def test_reveal_shows_the_song_and_the_ranking(client, running, clock):
    clock(16)
    r = get(client, running, D2).json()
    assert r["phase"]["name"] == "reveal"
    assert r["reveal"]["song"]["title"].startswith("Tema")
    assert r["reveal"]["my_answer"] is None
    assert [p["name"] for p in r["ranking"]] == ["Ana", "Beto"]
    assert r["round"]["index"] == 1  # the next round, so the device can preload its audio


def test_host_gets_no_preview_and_sees_who_answered(client, running, clock):
    clock(10)
    host = get(client, running, HOST).json()
    assert host["role"] == "host" and "preview_url" not in (host["round"] or {})
    assert all("answered" in p for p in host["players"])
    player = get(client, running, D2).json()
    assert player["role"] == "player"
    assert all("answered" not in p for p in player["players"])
    assert player["round"]["answered"] is False


def test_since_equal_to_key_says_nothing_changed(client, running, clock):
    clock(10)
    key = get(client, running, D2).json()["key"]
    r = get(client, running, D2, since=key).json()
    assert r["changed"] is False and "server_time" in r and "round" not in r
    clock(16)
    assert get(client, running, D2, since=key).json()["changed"] is True  # the phase moved on


def test_strangers_get_not_found_once_it_started(client, running, clock):
    clock(10)
    assert get(client, running, STRANGER).status_code == 404


def test_unknown_code_is_not_found(client, db):
    assert client.get(reverse("battles:detail", args=["ZZZZZZ"]), HTTP_X_DEVICE_ID=STRANGER).status_code == 404


def test_the_battle_is_marked_finished_when_the_time_is_over(client, running, clock):
    clock(500)
    r = get(client, running, D2).json()
    assert r["phase"]["name"] == "finished" and r["status"] == "finished"
    assert r["round"] is None and r["ranking"]
    running.refresh_from_db()
    assert running.status == Battle.FINISHED
    again = get(client, running, D2).json()  # idempotent
    assert again["status"] == "finished"


def test_a_stranger_sees_only_the_lobby_basics(client, db):
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST, title="Cumple")
    body = get(client, b, STRANGER).json()
    assert body.pop("server_time")  # so the device can tell the offset of its clock from the first poll
    assert body == {"joinable": True, "code": b.code, "title": "Cumple", "round_count": 3, "round_seconds": 10, "players_count": 0}


def test_lobby_lists_the_players_for_members(client, db):
    from battles.models import BattlePlayer

    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    r = get(client, b, D2).json()
    assert r["status"] == "lobby" and r["phase"]["name"] == "lobby" and [p["name"] for p in r["players"]] == ["Ana"]
    assert get(client, b, HOST).json()["role"] == "host"
