"""Deleting an account also takes its name and identity out of the battles, without breaking the rankings of the people left."""
import pytest

from accounts.models import AuthToken
from battles import services
from battles.models import Battle, BattleAnswer, BattlePlayer

from .conftest import D2, D3, HOST, at

ALLOWED = "ana@example.com"


@pytest.fixture
def users(django_user_model):
    return {
        "ana": django_user_model.objects.create_user(username="ana@example.com", email="ana@example.com", password="x" * 12),
        "beto": django_user_model.objects.create_user(username="beto@example.com", email="beto@example.com", password="x" * 12),
        "host": django_user_model.objects.create_user(username="host@example.com", email="host@example.com", password="x" * 12),
    }


def delete_account(client, user):
    r = client.delete("/api/me/", HTTP_AUTHORIZATION=f"Bearer {AuthToken.issue(user)}")
    assert r.status_code == 204


def battle_with(users, who=("ana", "beto")):
    b = Battle.objects.create(round_count=2, round_seconds=10, host_user=users["host"])
    for name in who:
        BattlePlayer.objects.create(battle=b, user=users[name], display_name=name.capitalize())
    return b


def test_the_player_stays_in_the_ranking_but_without_name_or_identity(client, users, db):
    b = battle_with(users)
    ana = BattlePlayer.objects.get(display_name="Ana")
    ana.device_id = ""  # claimed from a device
    ana.save()
    delete_account(client, users["ana"])

    gone = BattlePlayer.objects.get(pk=ana.pk)
    assert gone.user is None and gone.device_id == "" and "Ana" not in gone.display_name
    assert BattlePlayer.objects.filter(battle=b).count() == 2  # the other player's ranking is untouched


def test_two_deleted_players_in_one_room_do_not_clash(client, users, db):
    b = battle_with(users)
    delete_account(client, users["ana"])
    delete_account(client, users["beto"])
    names = list(BattlePlayer.objects.filter(battle=b).values_list("display_name", flat=True))
    assert len(set(n.lower() for n in names)) == 2 and all("eliminad" in n.lower() for n in names)


def test_their_answers_and_points_stay_for_the_rest_of_the_room(client, users, db, monkeypatch):
    from catalog.models import Album, Artist, Song

    artist = Artist.objects.create(mbid="a", name="A")
    album = Album.objects.create(mbid="al", name="D", artist=artist, year=2000)
    for i in range(4):
        Song.objects.create(mbid=f"s{i}", title=f"T{i}", album=album, deezer_id=900 + i)
    monkeypatch.setattr("battles.services.preview_url", lambda s: "https://cdn/x.mp3")
    b = Battle.objects.create(round_count=2, round_seconds=20, host_user=users["host"])
    ana = BattlePlayer.objects.create(battle=b, user=users["ana"], display_name="Ana")
    BattlePlayer.objects.create(battle=b, user=users["beto"], display_name="Beto")
    services.start_battle(b, now=at(0))
    services.submit_answer(b, ana, b.rounds.get(index=0).song_id, at(6))

    delete_account(client, users["ana"])

    assert BattleAnswer.objects.filter(player_id=ana.pk).count() == 1
    ranking = services.ranking(b)
    assert [r["points"] for r in ranking][0] > 0 and len(ranking) == 2
    assert not any(r["name"] == "Ana" for r in ranking)


def test_rooms_the_account_organized_stay_for_the_players_but_without_an_owner(client, users, db):
    b = battle_with(users)
    delete_account(client, users["host"])
    b.refresh_from_db()
    assert b.host_user is None and b.host_device_id == ""
    assert b.players.count() == 2


def test_an_abandoned_room_the_account_organized_is_deleted(client, users, db):
    empty = Battle.objects.create(round_count=3, round_seconds=10, host_user=users["host"])
    delete_account(client, users["host"])
    assert not Battle.objects.filter(pk=empty.pk).exists()


def test_other_people_s_rooms_and_players_are_not_touched(client, users, db):
    other = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    stays = BattlePlayer.objects.create(battle=other, device_id=D2, display_name="Zoe")
    delete_account(client, users["ana"])
    stays.refresh_from_db()
    assert stays.display_name == "Zoe" and stays.device_id == D2 and Battle.objects.filter(pk=other.pk).exists()


def test_the_deleted_account_no_longer_sees_its_battles(client, users, db):
    from django.urls import reverse

    battle_with(users)
    delete_account(client, users["ana"])
    r = client.get(reverse("battles:mine"), HTTP_X_DEVICE_ID=D3)
    assert r.json() == {"battles": []}
