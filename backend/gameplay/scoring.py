from django.conf import settings


def calculate_score(winning_attempt, total_time_seconds):
    base = settings.GAMEPLAY_BASE_SCORES[winning_attempt]
    return base + _speed_bonus(total_time_seconds)


def _speed_bonus(total_time_seconds):
    config = settings.GAMEPLAY_SPEED_BONUS
    min_elapsed = config["min_elapsed_seconds"]
    max_elapsed = config["max_elapsed_seconds"]
    max_bonus = config["max"]

    clamped = max(min_elapsed, min(total_time_seconds, max_elapsed))
    fraction_remaining = 1 - (clamped - min_elapsed) / (max_elapsed - min_elapsed)
    return round(max_bonus * fraction_remaining)
