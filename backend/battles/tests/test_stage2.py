"""Stage 2: the host plays the audio (audio_mode) and the organizer can accept the people who join (join_mode)."""
import pytest
from django.urls import reverse

from battles import services
from battles.models import Battle, BattlePlayer
from catalog.models import Album, Artist, Song

from .conftest import D2, D3, HOST, STRANGER, at

D4 = "55555555-5555-4555-8555-555555555555"


@pytest.fixture(autouse=True)
def open_to_everybody(settings):
    settings.BATTLES = {**settings.BATTLES, "CREATOR_EMAILS": ["*"], "MIN_PLAYERS": 1}


@pytest.fixture
def songs(db, monkeypatch):
    artist = Artist.objects.create(mbid="a", name="Artista")
    album = Album.objects.create(mbid="al", name="Disco", artist=artist, year=2000)
    monkeypatch.setattr("battles.services.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    monkeypatch.setattr("battles.state.preview_url", lambda s: f"https://cdn/{s.deezer_id}.mp3")
    return [Song.objects.create(mbid=f"s{i}", title=f"Tema {i}", album=album, deezer_id=1000 + i) for i in range(10)]


def api(client, name, code, device, body=None, token=""):
    return client.post(reverse(f"battles:{name}", args=[code]), data=body or {}, content_type="application/json", HTTP_X_DEVICE_ID=device, HTTP_X_HOST_TOKEN=token)


def state(client, code, device, token=""):
    return client.get(reverse("battles:detail", args=[code]), HTTP_X_DEVICE_ID=device, HTTP_X_HOST_TOKEN=token)


def create(client, **body):
    r = client.post(reverse("battles:create"), data=body, content_type="application/json", HTTP_X_DEVICE_ID=HOST)
    assert r.status_code == 201, r.content
    return r.json()


# --- creating -----------------------------------------------------------------------------------------------------------

def test_defaults_are_each_device_and_open(client, db):
    b = Battle.objects.get(code=create(client)["code"])
    assert (b.audio_mode, b.join_mode) == ("each", "open")


def test_the_modes_are_chosen_when_creating(client, db):
    b = Battle.objects.get(code=create(client, audio_mode="host", join_mode="approval")["code"])
    assert (b.audio_mode, b.join_mode) == ("host", "approval")


@pytest.mark.parametrize("body", [{"audio_mode": "tv"}, {"join_mode": "maybe"}, {"audio_mode": 3}, {"join_mode": None, "audio_mode": ["host"]}])
def test_unknown_modes_are_rejected(client, db, body):
    r = client.post(reverse("battles:create"), data=body, content_type="application/json", HTTP_X_DEVICE_ID=HOST)
    assert r.status_code == 400


# --- accepting people ---------------------------------------------------------------------------------------------------

def test_in_open_rooms_people_are_accepted_at_once(client, db):
    code = create(client)["code"]
    r = api(client, "join", code, D2, {"display_name": "Ana"})
    assert r.status_code == 201 and r.json()["player"] == {"name": "Ana", "status": "accepted"}


def test_in_approval_rooms_people_wait(client, db):
    code = create(client, join_mode="approval")["code"]
    r = api(client, "join", code, D2, {"display_name": "Ana"})
    assert r.json()["player"] == {"name": "Ana", "status": "pending"}


def test_the_organizer_sees_who_waits_and_the_room_list_only_has_the_accepted(client, db):
    made = create(client, join_mode="approval")
    code, token = made["code"], made["host_token"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    api(client, "join", code, D3, {"display_name": "Beto"})
    ana = BattlePlayer.objects.get(display_name="Ana")
    assert api(client, "review", code, HOST, {"player_id": ana.pk, "accept": True}, token).status_code == 200

    host = state(client, code, HOST, token).json()
    assert [p["name"] for p in host["players"]] == ["Ana"] and "id" in host["players"][0]
    assert [p["name"] for p in host["pending"]] == ["Beto"]
    # the others only see the accepted ones, and no ids
    seen_by_ana = state(client, code, D2).json()
    assert [p["name"] for p in seen_by_ana["players"]] == ["Ana"] and "id" not in seen_by_ana["players"][0]
    assert "pending" not in seen_by_ana
    assert seen_by_ana["my_status"] == "accepted"


def test_a_waiting_player_sees_only_his_status(client, db):
    code = create(client, join_mode="approval")["code"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    s = state(client, code, D2).json()
    assert s["my_status"] == "pending" and s["players"] == [] and s["round"] is None and "ranking" not in s


def test_a_rejected_player_is_told_so_and_cannot_come_back(client, db):
    made = create(client, join_mode="approval")
    code, token = made["code"], made["host_token"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    ana = BattlePlayer.objects.get(display_name="Ana")
    api(client, "review", code, HOST, {"player_id": ana.pk, "accept": False}, token)
    assert state(client, code, D2).json()["my_status"] == "rejected"
    again = api(client, "join", code, D2, {"display_name": "Otro nombre"})
    assert again.json()["player"] == {"name": "Ana", "status": "rejected"}


def test_rejecting_an_accepted_player_takes_him_out(client, db):
    made = create(client)
    code, token = made["code"], made["host_token"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    ana = BattlePlayer.objects.get(display_name="Ana")
    assert api(client, "review", code, HOST, {"player_id": ana.pk, "accept": False}, token).status_code == 200
    assert [p["name"] for p in state(client, code, HOST, token).json()["players"]] == []


def test_only_the_organizer_reviews(client, db):
    made = create(client, join_mode="approval")
    code = made["code"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    ana = BattlePlayer.objects.get(display_name="Ana")
    assert api(client, "review", code, D2, {"player_id": ana.pk, "accept": True}).status_code == 404
    assert api(client, "review", code, STRANGER, {"player_id": ana.pk, "accept": True}).status_code == 404
    ana.refresh_from_db()
    assert ana.status == "pending"


def test_review_needs_a_real_player_of_this_room_and_a_boolean(client, db):
    made = create(client, join_mode="approval")
    other = create(client, join_mode="approval")
    code, token = made["code"], made["host_token"]
    api(client, "join", other["code"], D2, {"display_name": "Ana"})
    foreign = BattlePlayer.objects.get(display_name="Ana")
    assert api(client, "review", code, HOST, {"player_id": foreign.pk, "accept": True}, token).status_code == 400
    assert api(client, "review", code, HOST, {"player_id": "x", "accept": True}, token).status_code == 400
    api(client, "join", code, D3, {"display_name": "Beto"})
    beto = BattlePlayer.objects.get(battle__code=code)
    assert api(client, "review", code, HOST, {"player_id": beto.pk, "accept": "yes"}, token).status_code == 400


def test_the_room_cannot_be_reviewed_once_started(client, songs, db):
    made = create(client, join_mode="approval", round_count=3)
    code, token = made["code"], made["host_token"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    ana = BattlePlayer.objects.get(display_name="Ana")
    api(client, "review", code, HOST, {"player_id": ana.pk, "accept": True}, token)
    assert api(client, "start", code, HOST, {}, token).status_code == 200
    assert api(client, "review", code, HOST, {"player_id": ana.pk, "accept": False}, token).status_code == 404


def test_starting_counts_only_the_accepted_and_closes_the_waiting_ones(client, songs, db, settings):
    settings.BATTLES = {**settings.BATTLES, "MIN_PLAYERS": 1}
    made = create(client, join_mode="approval", round_count=3)
    code, token = made["code"], made["host_token"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    assert api(client, "start", code, HOST, {}, token).status_code == 400  # nobody accepted yet
    ana = BattlePlayer.objects.get(display_name="Ana")
    api(client, "review", code, HOST, {"player_id": ana.pk, "accept": True}, token)
    api(client, "join", code, D3, {"display_name": "Beto"})
    assert api(client, "start", code, HOST, {}, token).status_code == 200
    assert BattlePlayer.objects.get(display_name="Beto").status == "rejected"


def test_waiting_and_rejected_players_cannot_answer_nor_rank(client, songs, db, clock):
    made = create(client, join_mode="approval", round_count=3)
    code, token = made["code"], made["host_token"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    api(client, "join", code, D3, {"display_name": "Beto"})
    ana = BattlePlayer.objects.get(display_name="Ana")
    api(client, "review", code, HOST, {"player_id": ana.pk, "accept": True}, token)
    api(client, "start", code, HOST, {}, token)
    battle = Battle.objects.get(code=code)
    clock(8)
    sid = battle.rounds.get(index=0).song_id
    assert api(client, "answer", code, D3, {"song_id": sid}).status_code == 404
    assert api(client, "answer", code, D2, {"song_id": sid}).status_code == 200
    assert [r["name"] for r in services.ranking(battle)] == ["Ana"]


def test_the_minimum_of_players_counts_only_the_accepted(client, songs, db, settings):
    settings.BATTLES = {**settings.BATTLES, "MIN_PLAYERS": 2}
    made = create(client, join_mode="approval", round_count=3)
    code, token = made["code"], made["host_token"]
    for device, name in ((D2, "Ana"), (D3, "Beto")):
        api(client, "join", code, device, {"display_name": name})
    ana = BattlePlayer.objects.get(display_name="Ana")
    api(client, "review", code, HOST, {"player_id": ana.pk, "accept": True}, token)
    assert api(client, "start", code, HOST, {}, token).status_code == 400  # one accepted, one waiting


# --- who hears the music ------------------------------------------------------------------------------------------------

def running_room(client, audio_mode):
    made = create(client, audio_mode=audio_mode, round_count=3)
    code, token = made["code"], made["host_token"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    api(client, "start", code, HOST, {}, token)
    return code, token


def test_in_each_mode_the_players_get_the_audio_and_the_organizer_does_not(client, songs, db, clock):
    code, token = running_room(client, "each")
    clock(8)
    assert state(client, code, D2).json()["round"]["preview_url"].startswith("https://cdn/")
    assert "preview_url" not in state(client, code, HOST, token).json()["round"]


def test_in_host_mode_only_the_organizer_gets_the_audio(client, songs, db, clock):
    code, token = running_room(client, "host")
    clock(8)
    host = state(client, code, HOST, token).json()
    assert host["round"]["preview_url"].startswith("https://cdn/") and host["audio_mode"] == "host"
    player = state(client, code, D2).json()
    assert "preview_url" not in player["round"] and player["audio_mode"] == "host"


# --- my battles ---------------------------------------------------------------------------------------------------------

def test_my_battles_counts_only_the_accepted(client, db):
    made = create(client, join_mode="approval")
    code, token = made["code"], made["host_token"]
    api(client, "join", code, D2, {"display_name": "Ana"})
    api(client, "join", code, D3, {"display_name": "Beto"})
    ana = BattlePlayer.objects.get(display_name="Ana")
    api(client, "review", code, HOST, {"player_id": ana.pk, "accept": True}, token)
    rows = client.get(reverse("battles:mine"), HTTP_X_DEVICE_ID=HOST).json()["battles"]
    assert rows[0]["players_count"] == 1
