from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from catalog.models import Album, Artist, Song
from gameplay.models import DailySong, GuessAttempt, PlayerStats

DEVICE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"


@pytest.fixture
def played_before_the_stats_existed(db):
    artist = Artist.objects.create(mbid="a", name="A")
    album = Album.objects.create(mbid="b", name="B", artist=artist, year=2000)
    song = Song.objects.create(mbid="c", title="C", album=album)
    daily = DailySong.objects.create(date=timezone.localdate(), song=song, state=DailySong.PUBLISHED)
    GuessAttempt.objects.create(
        device_id=DEVICE, daily_song=daily, attempt_number=1, guessed_text="C", is_correct=True, feedback={}
    )


def test_it_builds_the_stats_of_everyone_who_already_played(played_before_the_stats_existed):
    assert not PlayerStats.objects.exists()

    out = StringIO()
    call_command("recompute_stats", stdout=out)

    row = PlayerStats.objects.get(device_id=DEVICE)
    assert (row.played, row.won) == (1, 1)
    assert "1" in out.getvalue()


def test_running_it_twice_changes_nothing(played_before_the_stats_existed):
    call_command("recompute_stats", stdout=StringIO())
    call_command("recompute_stats", stdout=StringIO())

    assert PlayerStats.objects.count() == 1


def test_accounts_are_included_too(played_before_the_stats_existed):
    from django.contrib.auth import get_user_model

    account = get_user_model().objects.create_user("a@example.com", "a@example.com", "una-clave-larga-1")
    GuessAttempt.objects.update(user=account)

    call_command("recompute_stats", stdout=StringIO())

    assert PlayerStats.objects.get(user=account).played == 1
