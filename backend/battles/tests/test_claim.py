from accounts.claim import claim_device_games
from battles.models import Battle, BattlePlayer

HOST = "11111111-1111-1111-1111-111111111111"
D2 = "22222222-2222-2222-2222-222222222222"


def test_battles_played_on_the_device_move_to_the_account(db, django_user_model):
    user = django_user_model.objects.create_user(username="u", email="u@x.uy", password="x" * 12)
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    mine = BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana")
    hosted = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=D2)
    claim_device_games(user, D2)
    mine.refresh_from_db()
    hosted.refresh_from_db()
    assert mine.user == user and mine.device_id == ""
    assert hosted.host_user == user and hosted.host_device_id == ""


def test_if_the_account_already_plays_that_battle_the_device_row_stays(db, django_user_model):
    user = django_user_model.objects.create_user(username="u", email="u@x.uy", password="x" * 12)
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    BattlePlayer.objects.create(battle=b, user=user, display_name="Ana")
    other = BattlePlayer.objects.create(battle=b, device_id=D2, display_name="Ana 2")
    claim_device_games(user, D2)
    other.refresh_from_db()
    assert other.user is None and other.device_id == D2


def test_battles_of_other_devices_are_left_alone(db, django_user_model):
    user = django_user_model.objects.create_user(username="u", email="u@x.uy", password="x" * 12)
    b = Battle.objects.create(round_count=3, round_seconds=10, host_device_id=HOST)
    stranger = BattlePlayer.objects.create(battle=b, device_id="55555555-5555-5555-5555-555555555555", display_name="Zoe")
    claim_device_games(user, D2)
    stranger.refresh_from_db()
    assert stranger.user is None
