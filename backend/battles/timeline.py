from collections import namedtuple
from datetime import timedelta

Phase = namedtuple("Phase", "name index")


def build_schedule(start, round_count, round_seconds, countdown, reveal):
    """(starts_at, ends_at) of every round, fixed when the battle starts: nothing has to run in the background, because
    the phase at any moment is computed from these times."""
    first = start + timedelta(seconds=countdown)
    step = timedelta(seconds=round_seconds + reveal)
    return [(first + i * step, first + i * step + timedelta(seconds=round_seconds)) for i in range(round_count)]


def phase_at(rounds, now, reveal):
    if now < rounds[0].starts_at:
        return Phase("countdown", 0)
    for r in rounds:
        if now < r.ends_at:
            return Phase("playing", r.index)
        if now < r.ends_at + timedelta(seconds=reveal):
            return Phase("reveal", r.index)
    return Phase("finished", rounds[-1].index)
