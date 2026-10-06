"""The anonymous players of a battle (no account) lose their name and device after a week, like the daily game's anonymous data."""
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from battles.models import Battle, BattlePlayer
from battles.privacy import purge_anonymous_battles

HOST = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"
D3 = "33333333-3333-3333-3333-333333333333"


def old(obj, days, field="joined_at"):
    type(obj).objects.filter(pk=obj.pk).update(**{field: timezone.now() - timedelta(days=days)})


@pytest.fixture
def room(db):
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    ana = BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    beto = BattlePlayer.objects.create(battle=b, device_id=D3, display_name="Beto")
    return b, ana, beto


def test_old_anonymous_players_lose_their_name_and_device_but_keep_their_place(room):
    b, ana, beto = room
    old(ana, 8)
    counts = purge_anonymous_battles(days=7)
    ana.refresh_from_db()
    beto.refresh_from_db()
    assert ana.device_id == "" and ana.display_name == f"Jugador anónimo {ana.pk}" and BattlePlayer.objects.filter(pk=ana.pk).exists()
    assert beto.device_id == D3 and beto.display_name == "Beto"  # joined today: untouched
    assert counts["players"] == 1


def test_two_anonymized_players_in_one_room_do_not_clash(room):
    b, ana, beto = room
    old(ana, 9)
    old(beto, 9)
    purge_anonymous_battles(days=7)
    names = list(b.players.values_list("display_name", flat=True))
    assert len({n.lower() for n in names}) == 2


def test_players_with_an_account_are_never_touched(db, django_user_model):
    user = django_user_model.objects.create_user(username="a@x.uy", email="a@x.uy", password="x" * 12)
    b = Battle.objects.create(round_count=3, round_seconds=10, host_user=user)
    p = BattlePlayer.objects.create(battle=b, user=user, display_name="Ana")
    old(p, 400)
    old(b, 400, "created_at")
    purge_anonymous_battles(days=7)
    p.refresh_from_db()
    b.refresh_from_db()
    assert p.display_name == "Ana" and p.user == user and b.host_user == user


def test_an_anonymous_organizer_loses_the_device_after_a_week(room):
    b, *_ = room
    old(b, 10, "created_at")
    counts = purge_anonymous_battles(days=7)
    b.refresh_from_db()
    assert b.host_device_id == "" and counts["rooms"] == 1


def test_an_old_room_nobody_joined_is_deleted(db):
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    old(b, 10, "created_at")
    purge_anonymous_battles(days=7)
    assert not Battle.objects.filter(pk=b.pk).exists()


def test_a_recent_room_is_left_alone(room):
    b, ana, _ = room
    purge_anonymous_battles(days=7)
    b.refresh_from_db()
    assert b.host_device_id == HOST


def test_days_zero_switches_it_off(room):
    b, ana, _ = room
    old(ana, 100)
    old(b, 100, "created_at")
    assert purge_anonymous_battles(days=0) == {"players": 0, "rooms": 0}
    ana.refresh_from_db()
    assert ana.device_id == D2


def test_a_dry_run_only_counts(room):
    b, ana, _ = room
    old(ana, 8)
    assert purge_anonymous_battles(days=7, dry_run=True)["players"] == 1
    ana.refresh_from_db()
    assert ana.device_id == D2


def test_running_it_twice_changes_nothing_more(room):
    b, ana, _ = room
    old(ana, 8)
    purge_anonymous_battles(days=7)
    assert purge_anonymous_battles(days=7)["players"] == 0


def test_the_command_also_cleans_the_battles(room, capsys):
    b, ana, _ = room
    old(ana, 8)
    call_command("purge_inactive_anonymous", "--days", "7")
    ana.refresh_from_db()
    assert ana.device_id == ""
    assert "batalla" in capsys.readouterr().out.lower()
