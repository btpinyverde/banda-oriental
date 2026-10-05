"""Stage 4: teams, assigned at random or by the organizer, with a ranking per team (the average points of its members)."""
import pytest
from django.urls import reverse

from battles import services
from battles.models import Battle, BattlePlayer, BattleTeam
from catalog.models import Album, Artist, Song

from .conftest import D2, D3, HOST, STRANGER, at

D4 = "55555555-5555-4555-8555-555555555555"
D5 = "66666666-6666-4666-8666-666666666666"


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


def create(client, expect=201, **body):
    r = client.post(reverse("battles:create"), data=body, content_type="application/json", HTTP_X_DEVICE_ID=HOST)
    assert r.status_code == expect, r.content
    return r.json()


def room(client, players=("Ana", "Beto", "Caro", "Dani"), **body):
    made = create(client, round_count=3, **body)
    for device, name in zip((D2, D3, D4, D5), players):
        api(client, "join", made["code"], device, {"display_name": name})
    return made


def teams_of(code):
    return list(BattleTeam.objects.filter(battle__code=code).order_by("index"))


# --- creating ---------------------------------------------------------------------------------------------------------

def test_without_teams_there_are_none(client, db):
    made = create(client)
    assert Battle.objects.get(code=made["code"]).team_mode == "none" and teams_of(made["code"]) == []


def test_teams_are_created_with_default_names_and_colors(client, db):
    made = create(client, team_mode="random", team_count=3)
    teams = teams_of(made["code"])
    assert [t.name for t in teams] == ["Equipo 1", "Equipo 2", "Equipo 3"]
    assert len({t.color for t in teams}) == 3 and all(t.color.startswith("#") for t in teams)


def test_teams_can_be_named(client, db):
    made = create(client, team_mode="manual", team_count=2, team_names=["Los de acá", "  Los de allá "])
    assert [t.name for t in teams_of(made["code"])] == ["Los de acá", "Los de allá"]


def test_blank_names_fall_back_to_the_default(client, db):
    made = create(client, team_mode="manual", team_count=2, team_names=["", "Rojos"])
    assert [t.name for t in teams_of(made["code"])] == ["Equipo 1", "Rojos"]


@pytest.mark.parametrize(
    "body",
    [
        {"team_mode": "equipos", "team_count": 2},
        {"team_mode": "random"},
        {"team_mode": "random", "team_count": 1},
        {"team_mode": "random", "team_count": 7},
        {"team_mode": "random", "team_count": "dos"},
        {"team_mode": "random", "team_count": 2, "team_names": "uno"},
        {"team_mode": "random", "team_count": 2, "team_names": ["a", "b", "c"]},
        {"team_mode": "random", "team_count": 2, "team_names": [1, 2]},
        {"team_mode": "random", "team_count": 2, "team_names": ["x" * 51, "b"]},
        {"team_mode": "random", "team_count": 2, "team_names": ["Igual", "igual"]},
    ],
)
def test_bad_team_settings_are_refused(client, db, body):
    create(client, expect=400, **body)


def test_banned_words_are_refused_in_team_names(client, db, monkeypatch):
    monkeypatch.setattr("battles.services.contains_banned_word", lambda t: True)
    create(client, expect=400, team_mode="random", team_count=2, team_names=["a", "b"])


def test_the_team_count_is_ignored_without_teams(client, db):
    made = create(client, team_mode="none", team_count=9)
    assert teams_of(made["code"]) == []


# --- manual assignment -------------------------------------------------------------------------------------------------

def test_the_organizer_puts_players_in_teams_and_takes_them_out(client, db):
    made = room(client, team_mode="manual", team_count=2)
    code, token = made["code"], made["host_token"]
    ana, t1 = BattlePlayer.objects.get(display_name="Ana"), teams_of(code)[0]

    assert api(client, "team", code, HOST, {"player_id": ana.pk, "team_id": t1.pk}, token).status_code == 200
    ana.refresh_from_db()
    assert ana.team_id == t1.pk
    assert api(client, "team", code, HOST, {"player_id": ana.pk, "team_id": None}, token).status_code == 200
    ana.refresh_from_db()
    assert ana.team_id is None


def test_only_the_organizer_assigns_and_only_in_manual_rooms_in_the_lobby(client, songs, db):
    made = room(client, team_mode="manual", team_count=2)
    code, token = made["code"], made["host_token"]
    ana, t1 = BattlePlayer.objects.get(display_name="Ana"), teams_of(code)[0]
    assert api(client, "team", code, D2, {"player_id": ana.pk, "team_id": t1.pk}).status_code == 404
    assert api(client, "team", code, STRANGER, {"player_id": ana.pk, "team_id": t1.pk}).status_code == 404

    random_made = room(client, team_mode="random", team_count=2)
    other = BattlePlayer.objects.filter(battle__code=random_made["code"]).first()
    assert api(client, "team", random_made["code"], HOST, {"player_id": other.pk, "team_id": teams_of(random_made["code"])[0].pk}, random_made["host_token"]).status_code == 400

    api(client, "start", code, HOST, {}, token)
    assert api(client, "team", code, HOST, {"player_id": ana.pk, "team_id": t1.pk}, token).status_code == 404


def test_assignment_needs_a_real_accepted_player_and_a_team_of_this_room(client, db):
    made = room(client, team_mode="manual", team_count=2, join_mode="approval")
    other = room(client, team_mode="manual", team_count=2)
    code, token = made["code"], made["host_token"]
    waiting = BattlePlayer.objects.get(battle__code=code, display_name="Ana")  # waits for approval
    t1 = teams_of(code)[0]
    assert api(client, "team", code, HOST, {"player_id": waiting.pk, "team_id": t1.pk}, token).status_code == 400
    waiting.status = "accepted"
    waiting.save()
    assert api(client, "team", code, HOST, {"player_id": waiting.pk, "team_id": teams_of(other["code"])[0].pk}, token).status_code == 400
    assert api(client, "team", code, HOST, {"player_id": "x", "team_id": t1.pk}, token).status_code == 400
    assert api(client, "team", code, HOST, {"player_id": waiting.pk, "team_id": "x"}, token).status_code == 400


# --- starting ---------------------------------------------------------------------------------------------------------

def sizes(code):
    """How many players each team has, smallest first."""
    return sorted(BattlePlayer.objects.filter(team=t).count() for t in teams_of(code))


def test_random_teams_are_balanced_when_the_battle_starts(client, songs, db):
    made = room(client, team_mode="random", team_count=2)
    assert api(client, "start", made["code"], HOST, {}, made["host_token"]).status_code == 200
    assert sizes(made["code"]) == [2, 2]
    assert not BattlePlayer.objects.filter(battle__code=made["code"], team__isnull=True).exists()


def test_odd_numbers_leave_a_difference_of_one(client, songs, db):
    made = room(client, team_mode="random", team_count=2, players=("Ana", "Beto", "Caro"))
    api(client, "start", made["code"], HOST, {}, made["host_token"])
    assert sizes(made["code"]) == [1, 2]


def test_manual_teams_keep_what_the_organizer_did_and_the_rest_are_spread(client, songs, db):
    made = room(client, team_mode="manual", team_count=2)
    code, token = made["code"], made["host_token"]
    t1, t2 = teams_of(code)
    for name in ("Ana", "Beto", "Caro"):
        api(client, "team", code, HOST, {"player_id": BattlePlayer.objects.get(display_name=name).pk, "team_id": t1.pk}, token)
    api(client, "start", code, HOST, {}, token)
    assert BattlePlayer.objects.filter(team=t1).count() + BattlePlayer.objects.filter(team=t2).count() == 4
    assert {p.display_name for p in BattlePlayer.objects.filter(team=t1)} >= {"Ana", "Beto", "Caro"}
    assert {p.display_name for p in BattlePlayer.objects.filter(team=t2)} == {"Dani"}


def test_unassigned_players_go_to_the_smallest_team(client, songs, db):
    made = room(client, team_mode="manual", team_count=2, players=("Ana", "Beto", "Caro"))
    code, token = made["code"], made["host_token"]
    t1, t2 = teams_of(code)
    api(client, "team", code, HOST, {"player_id": BattlePlayer.objects.get(display_name="Ana").pk, "team_id": t1.pk}, token)
    api(client, "start", code, HOST, {}, token)
    assert sizes(code) == [1, 2]  # balanced: the two loose players were spread, not piled on one team
    assert BattlePlayer.objects.get(display_name="Ana").team_id == t1.pk


def test_without_teams_nobody_gets_one(client, songs, db):
    made = room(client)
    api(client, "start", made["code"], HOST, {}, made["host_token"])
    assert not BattlePlayer.objects.filter(battle__code=made["code"], team__isnull=False).exists()


def test_two_teams_with_people_are_needed_once_the_mode_is_open(client, songs, db, settings):
    settings.BATTLES = {**settings.BATTLES, "MIN_PLAYERS": 2}
    made = room(client, team_mode="manual", team_count=3, players=("Ana", "Beto"))
    code, token = made["code"], made["host_token"]
    t1 = teams_of(code)[0]
    for name in ("Ana", "Beto"):
        api(client, "team", code, HOST, {"player_id": BattlePlayer.objects.get(display_name=name).pk, "team_id": t1.pk}, token)
    # both in the same team: the unassigned are none, and only one team has people
    r = api(client, "start", code, HOST, {}, token)
    assert r.status_code == 400 and "dos equipos" in str(r.json())
    assert Battle.objects.get(code=code).status == "lobby"


# --- what everybody sees ----------------------------------------------------------------------------------------------

def test_the_state_lists_the_teams_and_each_player_s_team(client, db):
    made = room(client, team_mode="manual", team_count=2)
    code, token = made["code"], made["host_token"]
    t1 = teams_of(code)[0]
    ana = BattlePlayer.objects.get(display_name="Ana")
    api(client, "team", code, HOST, {"player_id": ana.pk, "team_id": t1.pk}, token)

    seen = state(client, code, D3).json()
    assert [t["name"] for t in seen["teams"]] == ["Equipo 1", "Equipo 2"] and all("color" in t and "id" in t for t in seen["teams"])
    assert next(p for p in seen["players"] if p["name"] == "Ana")["team"] == t1.pk
    assert next(p for p in seen["players"] if p["name"] == "Beto")["team"] is None
    assert seen["team_mode"] == "manual" and seen["my_team"] is None
    assert state(client, code, D2).json()["my_team"] == t1.pk


def test_without_teams_the_state_has_no_team_fields(client, db):
    made = room(client)
    seen = state(client, made["code"], D2).json()
    assert seen["team_mode"] == "none" and seen["teams"] == [] and "team" not in seen["players"][0]


def test_the_team_ranking_uses_the_average_points_of_the_members(client, songs, db, clock):
    made = room(client, team_mode="manual", team_count=2)
    code, token = made["code"], made["host_token"]
    t1, t2 = teams_of(code)
    for name, team in (("Ana", t1), ("Beto", t1), ("Caro", t2), ("Dani", t2)):
        api(client, "team", code, HOST, {"player_id": BattlePlayer.objects.get(display_name=name).pk, "team_id": team.pk}, token)
    api(client, "start", code, HOST, {}, token)
    battle = Battle.objects.get(code=code)
    right = battle.rounds.get(index=0).song_id
    p = {x.display_name: x for x in battle.players.all()}
    services.submit_answer(battle, p["Ana"], right, at(5))      # 150
    services.submit_answer(battle, p["Caro"], right, at(24.99))  # 100: the last instant of a 20 s round
    services.submit_answer(battle, p["Dani"], right, at(24.99))  # 100
    clock(26)  # round 0 ran from +5 to +25: this is its reveal
    rows = state(client, code, D2).json()["team_ranking"]
    assert [r["name"] for r in rows] == ["Equipo 2", "Equipo 1"]
    assert rows[0] == {"position": 1, "id": t2.pk, "name": "Equipo 2", "color": t2.color, "members": 2, "points": 100, "total": 200, "correct": 2}
    assert rows[1]["points"] == 75 and rows[1]["total"] == 150 and rows[1]["members"] == 2


def test_teams_without_members_are_left_out_of_the_ranking(client, songs, db, clock):
    made = room(client, team_mode="manual", team_count=3, players=("Ana", "Beto"))
    code, token = made["code"], made["host_token"]
    t1 = teams_of(code)[0]
    for name in ("Ana", "Beto"):
        api(client, "team", code, HOST, {"player_id": BattlePlayer.objects.get(display_name=name).pk, "team_id": t1.pk}, token)
    api(client, "start", code, HOST, {}, token)
    clock(26)  # round 0 ran from +5 to +25: this is its reveal
    assert [r["name"] for r in state(client, code, D2).json()["team_ranking"]] == ["Equipo 1"]


def test_no_team_ranking_without_teams(client, songs, db, clock):
    made = room(client)
    api(client, "start", made["code"], HOST, {}, made["host_token"])
    clock(26)  # round 0 ran from +5 to +25: this is its reveal
    assert "team_ranking" not in state(client, made["code"], D2).json()
