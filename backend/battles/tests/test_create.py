import pytest
from django.urls import reverse

from battles.models import Battle

D1 = "11111111-1111-1111-1111-111111111111"


def create(client, **body):
    return client.post(reverse("battles:create"), data=body, content_type="application/json", HTTP_X_DEVICE_ID=D1)


def test_creates_a_battle_with_defaults(client, db):
    r = create(client)
    assert r.status_code == 201
    data = r.json()
    battle = Battle.objects.get(code=data["code"])
    assert (battle.round_count, battle.round_seconds) == (10, 20)
    assert battle.status == Battle.LOBBY
    assert battle.host_device_id == D1
    assert data["host_token"] == battle.host_token


def test_takes_rounds_seconds_and_title(client, db):
    r = create(client, round_count=5, round_seconds=15, title="Cumple de Ana")
    assert r.status_code == 201
    b = Battle.objects.get(code=r.json()["code"])
    assert (b.round_count, b.round_seconds, b.title) == (5, 15, "Cumple de Ana")


@pytest.mark.parametrize("body", [{"round_count": 2}, {"round_count": 31}, {"round_seconds": 4}, {"round_seconds": 61}, {"round_count": "x"}, {"title": 5}])
def test_rejects_out_of_range_or_wrong_types(client, db, body):
    assert create(client, **body).status_code == 400


def test_rejects_a_banned_title(client, db, monkeypatch):
    monkeypatch.setattr("battles.services.contains_banned_word", lambda text: True)
    assert create(client, title="x").status_code == 400


def test_needs_a_device_id(client, db):
    assert client.post(reverse("battles:create"), data={}, content_type="application/json").status_code == 400
