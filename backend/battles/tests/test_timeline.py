from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from battles.timeline import build_schedule, phase_at

T0 = datetime(2026, 10, 5, 20, 0, 0, tzinfo=timezone.utc)


def s(n):
    return T0 + timedelta(seconds=n)


def rounds_for(count=3, seconds=20, countdown=5, reveal=6):
    return [SimpleNamespace(index=i, starts_at=a, ends_at=b) for i, (a, b) in enumerate(build_schedule(T0, count, seconds, countdown, reveal))]


def test_schedule_leaves_a_countdown_and_a_reveal_between_rounds():
    assert build_schedule(T0, 3, 20, 5, 6) == [(s(5), s(25)), (s(31), s(51)), (s(57), s(77))]


def test_phases_along_the_battle():
    rounds = rounds_for()
    assert phase_at(rounds, s(0), 6) == ("countdown", 0)
    assert phase_at(rounds, s(4.9), 6) == ("countdown", 0)
    assert phase_at(rounds, s(5), 6) == ("playing", 0)
    assert phase_at(rounds, s(24.9), 6) == ("playing", 0)
    assert phase_at(rounds, s(25), 6) == ("reveal", 0)  # the round closes exactly at ends_at
    assert phase_at(rounds, s(30.9), 6) == ("reveal", 0)
    assert phase_at(rounds, s(31), 6) == ("playing", 1)
    assert phase_at(rounds, s(76.9), 6) == ("playing", 2)
    assert phase_at(rounds, s(77), 6) == ("reveal", 2)
    assert phase_at(rounds, s(83), 6) == ("finished", 2)
    assert phase_at(rounds, s(9999), 6) == ("finished", 2)
