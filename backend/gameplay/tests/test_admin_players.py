"""The admin shows who played: every attempt, every score and every player's stats, to look things up and moderate.
What the game saved is read-only (nothing is added or edited by hand); rows can be deleted (offensive names, test data),
and a name can be cleared."""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, PlayerStats, ScoreEntry

User = get_user_model()
DEVICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


@pytest.fixture
def staff_client(client, db):
    client.force_login(User.objects.create_superuser(username="admin@example.com", email="admin@example.com", password="pw"))
    return client


@pytest.fixture
def played(db):
    artist = Artist.objects.create(mbid="a", name="A")
    album = Album.objects.create(mbid="b", name="B", artist=artist, year=2000)
    song = Song.objects.create(mbid="c", title="Luna negra", album=album)
    daily = DailySong.objects.create(date=timezone.localdate(), song=song, state=DailySong.PUBLISHED)
    account = User.objects.create_user("ana@example.com", "ana@example.com", "una-clave-larga-1")
    GuessAttempt.objects.create(device_id=DEVICE, daily_song=daily, attempt_number=1, guessed_text="Intento anónimo", is_correct=False, feedback={})
    GuessAttempt.objects.create(user=account, device_id="x" * 36, daily_song=daily, attempt_number=1, guessed_text="Intento de cuenta", is_correct=True, feedback={})
    ScoreEntry.objects.create(device_id=DEVICE, daily_song=daily, display_name="Anónimo Ana", score=700, winning_attempt=2, total_time_seconds=31)
    ScoreEntry.objects.create(user=account, device_id="x" * 36, daily_song=daily, display_name="Ana", score=950, winning_attempt=1, total_time_seconds=12)
    PlayerStats.objects.create(device_id=DEVICE, public_name="Anónimo Ana", played=1, won=1, current_streak=1, max_streak=1, total_score=700)
    PlayerStats.objects.create(user=account, public_name="Ana", played=3, won=3, current_streak=3, max_streak=3, total_score=2500)
    return account


@pytest.mark.parametrize("model", ["guessattempt", "scoreentry", "playerstats"])
def test_each_screen_exists_and_loads(staff_client, played, model):
    assert staff_client.get(reverse(f"admin:gameplay_{model}_changelist")).status_code == 200


def test_the_admin_index_lists_them_under_the_game(staff_client, played):
    page = staff_client.get(reverse("admin:index")).content.decode()

    for name in ("Intentos", "Puntajes", "Estadísticas de jugadores"):
        assert name in page


def test_the_stats_screen_shows_the_name_the_numbers_and_whose_they_are(staff_client, played):
    page = staff_client.get(reverse("admin:gameplay_playerstats_changelist")).content.decode()

    assert "Ana" in page and "ana@example.com" in page  # the account's owner
    assert "Anónimo Ana" in page and "anónimo" in page.lower()  # the device's owner
    assert "2500" in page


def test_the_scores_screen_shows_each_score_with_its_name_and_owner(staff_client, played):
    page = staff_client.get(reverse("admin:gameplay_scoreentry_changelist")).content.decode()

    assert "950" in page and "700" in page
    assert "ana@example.com" in page


def test_the_attempts_screen_shows_each_attempt_and_whether_it_was_right(staff_client, played):
    page = staff_client.get(reverse("admin:gameplay_guessattempt_changelist")).content.decode()

    assert "Intento anónimo" in page and "Intento de cuenta" in page


@pytest.mark.parametrize(
    "model,query,expected",
    [
        ("playerstats", "ana@example.com", 1),
        ("playerstats", "Anónimo", 1),
        ("playerstats", DEVICE, 1),
        ("scoreentry", "Anónimo Ana", 1),
        ("scoreentry", "ana@example.com", 1),
        ("guessattempt", "Intento de cuenta", 1),
    ],
)
def test_they_can_be_searched_by_name_account_or_device(staff_client, played, model, query, expected):
    page = staff_client.get(reverse(f"admin:gameplay_{model}_changelist"), {"q": query})

    assert page.context["cl"].result_count == expected


@pytest.mark.parametrize("model", ["guessattempt", "scoreentry", "playerstats"])
def test_nothing_can_be_added_by_hand(staff_client, played, model):
    assert staff_client.get(reverse(f"admin:gameplay_{model}_add")).status_code == 403


@pytest.mark.parametrize("model", ["guessattempt", "scoreentry"])
def test_attempts_and_scores_cannot_be_edited(staff_client, played, model):
    obj = {"guessattempt": GuessAttempt, "scoreentry": ScoreEntry}[model].objects.first()

    response = staff_client.post(reverse(f"admin:gameplay_{model}_change", args=[obj.pk]), {"score": 1, "guessed_text": "cambiado"})

    obj.refresh_from_db()
    assert getattr(obj, "guessed_text", "") != "cambiado" and getattr(obj, "score", 0) != 1
    assert response.status_code in (200, 403, 302)


def test_a_player_name_can_be_cleared_for_moderation_but_nothing_else_changes(staff_client, played):
    row = PlayerStats.objects.get(public_name="Anónimo Ana")

    staff_client.post(
        reverse("admin:gameplay_playerstats_change", args=[row.pk]),
        {"public_name": "", "played": 99, "total_score": 99999, "current_streak": 99},
    )

    row.refresh_from_db()
    assert row.public_name in (None, "")
    assert (row.played, row.total_score, row.current_streak) == (1, 700, 1)


def test_rows_can_be_deleted_to_remove_test_data_or_an_offensive_score(staff_client, played):
    score = ScoreEntry.objects.get(display_name="Anónimo Ana")

    response = staff_client.post(reverse("admin:gameplay_scoreentry_delete", args=[score.pk]), {"post": "yes"})

    assert response.status_code == 302
    assert not ScoreEntry.objects.filter(pk=score.pk).exists()
