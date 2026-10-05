"""A bar's phones share one address: joining, answering and polling must not run into the limits made for one visitor."""
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from battles import services
from core.human import HasHumanPass
from core.throttling import IpThrottle, ScopedIpThrottle

from .conftest import D2, at

BROWSER = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1"


@pytest.fixture
def rates(monkeypatch):
    def set_rates(**values):
        merged = {"global": "1000/min", **values}
        monkeypatch.setattr(IpThrottle, "THROTTLE_RATES", merged)
        monkeypatch.setattr(ScopedIpThrottle, "THROTTLE_RATES", merged)

    return set_rates


def phone(device):
    c = APIClient(REMOTE_ADDR="8.8.8.8", HTTP_USER_AGENT=BROWSER)
    c.defaults["HTTP_X_DEVICE_ID"] = device
    return c


def test_answers_do_not_count_against_the_global_limit(running, clock, rates):
    rates(**{"global": "2/min", "battle-answer": "1000/min"})
    clock(8)
    sid = running.rounds.get(index=0).song_id
    url = reverse("battles:answer", args=[running.code])
    # four different players from one address: more than the global limit would allow
    codes = []
    for device in (D2, "33333333-3333-3333-3333-333333333333"):
        codes.append(phone(device).post(url, {"song_id": sid}, format="json").status_code)
    assert codes == [200, 200]
    assert phone(D2).post(url, {"song_id": sid}, format="json").status_code == 200


def test_polling_does_not_count_against_the_global_limit(running, clock, rates):
    rates(**{"global": "2/min", "battle-state": "1000/min"})
    clock(8)
    url = reverse("battles:detail", args=[running.code])
    assert [phone(D2).get(url).status_code for _ in range(6)] == [200] * 6


def test_joining_does_not_count_against_the_global_limit_nor_ask_for_the_human_check(db, rates):
    from battles.models import Battle

    rates(**{"global": "2/min", "battle-join": "1000/hour"})
    battle = Battle.objects.create(round_count=3, round_seconds=10, host_device_id="11111111-1111-1111-1111-111111111111")
    url = reverse("battles:join", args=[battle.code])
    codes = [phone(f"{i:08d}-0000-0000-0000-000000000000").post(url, {"display_name": f"J{i}"}, format="json").status_code for i in range(6)]
    assert codes == [201] * 6


def test_the_join_view_does_not_require_a_human_pass():
    from battles.views import JoinView

    assert HasHumanPass not in JoinView.permission_classes


def test_a_whole_bar_fits_the_configured_limits():
    """60 players on one address, each polling every 2 s and answering once per round, stay well under the scoped limits."""
    from django.conf import settings

    rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]

    def per_hour(key):
        count, period = rates[key].split("/")
        return int(count) * (60 if period == "min" else 1)

    assert per_hour("battle-state") >= 60 * 30 * 60 * 1.5  # a poll every 2 s for an hour, with room to spare
    assert per_hour("battle-answer") >= 60 * 2 * 60  # an answer per player every 30 s at the very least
    assert per_hour("battle-join") >= 120  # two full rooms in the same hour
