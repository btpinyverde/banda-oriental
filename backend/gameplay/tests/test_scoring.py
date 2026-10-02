from django.test import override_settings

from gameplay.scoring import calculate_score

SCORING_SETTINGS = {
    "GAMEPLAY_BASE_SCORES": {1: 100, 2: 85, 3: 70, 4: 55, 5: 40, 6: 20},
    "GAMEPLAY_SPEED_BONUS": {"max": 50, "min_elapsed_seconds": 1, "max_elapsed_seconds": 60},
}


@override_settings(**SCORING_SETTINGS)
def test_fastest_possible_first_attempt_scores_base_plus_full_bonus():
    # At or below min_elapsed_seconds, the bonus is the full max.
    assert calculate_score(winning_attempt=1, total_time_seconds=0.5) == 100 + 50


@override_settings(**SCORING_SETTINGS)
def test_slowest_counted_attempt_scores_base_plus_zero_bonus():
    # At or above max_elapsed_seconds, the bonus floors at zero.
    assert calculate_score(winning_attempt=1, total_time_seconds=120) == 100 + 0


@override_settings(**SCORING_SETTINGS)
def test_bonus_decreases_linearly_between_the_floor_and_ceiling():
    # Halfway between min (1s) and max (60s) elapsed → half the max bonus.
    halfway = (1 + 60) / 2
    assert calculate_score(winning_attempt=1, total_time_seconds=halfway) == 100 + 25


@override_settings(**SCORING_SETTINGS)
def test_base_score_decreases_by_attempt():
    # Same time for every attempt isolates the base-score component.
    scores = [calculate_score(winning_attempt=n, total_time_seconds=0.5) for n in range(1, 7)]
    assert scores == [150, 135, 120, 105, 90, 70]


@override_settings(**SCORING_SETTINGS)
def test_negative_elapsed_time_is_clamped_to_the_floor_not_a_bug():
    # A client-reported negative time (clock skew, bad data) must not
    # produce a bonus larger than the configured max.
    assert calculate_score(winning_attempt=1, total_time_seconds=-5) == 100 + 50
