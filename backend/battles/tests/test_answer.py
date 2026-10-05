import pytest
from django.urls import reverse

from battles import services
from battles.models import BattleAnswer, BattlePlayer
from .conftest import D2, D3, HOST, STRANGER, at


def answer(client, battle, song_id, device=D2):
    return client.post(
        reverse("battles:answer", args=[battle.code]), data={"song_id": song_id}, content_type="application/json", HTTP_X_DEVICE_ID=device
    )


def players(battle):
    return {p.display_name: p for p in battle.players.all()}


def test_a_fast_correct_answer_gets_base_plus_bonus(running, clock):
    ana = players(running)["Ana"]
    right = running.rounds.get(index=0).song_id
    a = services.submit_answer(running, ana, right, at(10))  # 5 s into a 10 s round: half the bonus
    assert a.correct and a.points == 100 + 25


def test_the_last_instant_gets_no_bonus_and_the_first_gets_all(running):
    ana, beto = players(running)["Ana"], players(running)["Beto"]
    right = running.rounds.get(index=0).song_id
    assert services.submit_answer(running, ana, right, at(5)).points == 150
    assert services.submit_answer(running, beto, right, at(14.99)).points == 100


def test_a_wrong_answer_scores_zero(running):
    ana = players(running)["Ana"]
    wrong = running.rounds.get(index=1).song_id
    a = services.submit_answer(running, ana, wrong, at(6))
    assert not a.correct and a.points == 0


@pytest.mark.parametrize("seconds", [4.9, 15, 20, 100])
def test_outside_the_round_window_is_refused(running, seconds):
    from rest_framework.exceptions import ValidationError

    ana = players(running)["Ana"]
    with pytest.raises(ValidationError):
        services.submit_answer(running, ana, running.rounds.get(index=0).song_id, at(seconds))
    assert BattleAnswer.objects.count() == 0


def test_the_first_answer_stands(running):
    ana = players(running)["Ana"]
    first = running.rounds.get(index=0).song_id
    other = running.rounds.get(index=1).song_id
    services.submit_answer(running, ana, first, at(6))
    again = services.submit_answer(running, ana, other, at(7))
    assert again.correct and BattleAnswer.objects.count() == 1


def test_endpoint_does_not_say_whether_it_was_right(client, running, clock):
    clock(8)
    r = answer(client, running, running.rounds.get(index=0).song_id)
    assert r.status_code == 200 and r.json() == {"received": True}
    running.refresh_from_db()
    assert running.version > 2


def test_host_and_strangers_get_not_found(client, running, clock):
    clock(8)
    sid = running.rounds.get(index=0).song_id
    assert answer(client, running, sid, device=HOST).status_code == 404
    assert answer(client, running, sid, device=STRANGER).status_code == 404


def test_bad_song_id_is_a_bad_request(client, running, clock):
    clock(8)
    assert answer(client, running, "x").status_code == 400
    assert answer(client, running, 10**9).status_code == 400


def test_ranking_orders_by_points_then_hits_then_name(running):
    p = players(running)
    right0 = running.rounds.get(index=0).song_id
    services.submit_answer(running, p["Beto"], right0, at(6))
    services.submit_answer(running, p["Ana"], right0, at(12))
    rows = services.ranking(running)
    assert [(r["position"], r["name"]) for r in rows] == [(1, "Beto"), (2, "Ana")]
    assert rows[0]["points"] > rows[1]["points"] and rows[0]["correct"] == 1


def test_ranking_with_nobody_scoring_orders_by_name(running):
    assert [r["name"] for r in services.ranking(running)] == ["Ana", "Beto"]
