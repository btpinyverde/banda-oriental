"""Protection against abuse and automation: per-IP limits, AI agents, the human check and cheap-to-serve endpoints."""
from unittest.mock import patch

import pytest
from accounts.models import AuthToken
from catalog.models import Album, Artist, Song
from core.throttling import IpThrottle, ScopedIpThrottle
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

User = get_user_model()
BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"
DEVICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


@pytest.fixture(autouse=True)
def fresh_cache():
    cache.clear()


@pytest.fixture
def api(db):
    client = APIClient()
    client.defaults["HTTP_USER_AGENT"] = BROWSER
    return client


@pytest.fixture
def rates(monkeypatch):
    """Small limits so a test can hit them in a few requests."""

    def set_rates(**values):
        merged = {"global": "1000/min", **values}
        monkeypatch.setattr(IpThrottle, "THROTTLE_RATES", merged)
        monkeypatch.setattr(ScopedIpThrottle, "THROTTLE_RATES", merged)

    return set_rates


class TestClientIp:
    def test_uses_the_connection_address_by_default(self, api, rates):
        rates(**{"global": "2/min"})

        for ip in ("1.1.1.1", "2.2.2.2", "3.3.3.3"):
            last = api.get(reverse("health"), HTTP_CF_CONNECTING_IP=ip, REMOTE_ADDR="9.9.9.9")

        # The header is ignored unless it is trusted: all three count as the same visitor.
        assert last.status_code == 429

    def test_trusts_the_cloudflare_header_only_when_enabled(self, api, rates, settings):
        settings.TRUST_CLOUDFLARE_IP_HEADER = True
        rates(**{"global": "2/min"})

        codes = [api.get(reverse("health"), HTTP_CF_CONNECTING_IP=ip, REMOTE_ADDR="9.9.9.9").status_code for ip in ("1.1.1.1", "1.1.1.1", "1.1.1.1", "2.2.2.2")]

        assert codes == [200, 200, 429, 200]

    def test_a_malformed_header_falls_back_to_the_connection_address(self, api, rates, settings):
        settings.TRUST_CLOUDFLARE_IP_HEADER = True
        rates(**{"global": "1/min"})

        api.get(reverse("health"), HTTP_CF_CONNECTING_IP="no-es-una-ip", REMOTE_ADDR="9.9.9.9")
        second = api.get(reverse("health"), HTTP_CF_CONNECTING_IP="<script>", REMOTE_ADDR="9.9.9.9")

        assert second.status_code == 429


class TestThrottling:
    def test_one_visitor_cannot_flood_the_api(self, api, rates):
        rates(**{"global": "3/min"})

        codes = [api.get(reverse("health"), REMOTE_ADDR="8.8.8.8").status_code for _ in range(5)]

        assert codes == [200, 200, 200, 429, 429]

    def test_another_visitor_is_not_affected(self, api, rates):
        rates(**{"global": "1/min"})
        api.get(reverse("health"), REMOTE_ADDR="8.8.8.8")
        api.get(reverse("health"), REMOTE_ADDR="8.8.8.8")

        assert api.get(reverse("health"), REMOTE_ADDR="7.7.7.7").status_code == 200

    def test_the_answer_is_in_spanish_and_says_when_to_come_back(self, api, rates):
        rates(**{"global": "1/min"})
        api.get(reverse("health"))

        response = api.get(reverse("health"))

        assert response.status_code == 429
        assert "Demasiados pedidos" in response.json()["detail"]
        assert response.json()["retry_after"] >= 1
        assert int(response["Retry-After"]) >= 1

    def test_a_blocked_visitor_is_logged_with_the_address_that_was_counted(self, api, rates, settings, caplog):
        import logging

        settings.TRUST_CLOUDFLARE_IP_HEADER = True
        rates(**{"global": "1/min"})
        api.get(reverse("health"), HTTP_CF_CONNECTING_IP="203.0.113.7")

        with caplog.at_level(logging.WARNING):
            api.get(reverse("health"), HTTP_CF_CONNECTING_IP="203.0.113.7")

        assert "203.0.113.7" in caplog.text
        assert "límite" in caplog.text.lower()

    @pytest.mark.parametrize(
        "url, body",
        [
            ("/api/auth/login/", {"email": "a@b.co", "password": "x"}),
            ("/api/auth/register/", {"email": "a@b.co", "password": "una-clave-larga-1"}),
            ("/api/auth/magic/request/", {"email": "a@b.co"}),
            ("/api/auth/password-reset/request/", {"email": "a@b.co"}),
        ],
    )
    def test_the_account_endpoints_have_their_own_stricter_limit(self, api, rates, url, body):
        scope = "auth" if "login" in url else "send-email"
        rates(**{scope: "2/hour"})

        codes = [api.post(url, body, format="json").status_code for _ in range(4)]

        assert codes[-1] == 429 and codes[0] != 429

    def test_guessing_and_sending_scores_are_limited(self, api, rates):
        rates(guess="2/min", score="1/hour")

        guesses = [
            api.post("/api/daily/guess/", {"song_id": 1, "attempt_number": 1}, format="json", HTTP_X_DEVICE_ID=DEVICE).status_code
            for _ in range(3)
        ]
        scores = [
            api.post("/api/daily/score/", {"display_name": "x", "total_time_seconds": 5}, format="json", HTTP_X_DEVICE_ID=DEVICE).status_code
            for _ in range(2)
        ]

        assert guesses[-1] == 429 and scores[-1] == 429

    def test_a_blocked_visitor_can_still_read_the_health_check_of_another(self, api, rates):
        # Limits are per visitor: the uptime monitor (another address) keeps working during an attack.
        rates(**{"global": "1/min"})
        for _ in range(3):
            api.get(reverse("health"), REMOTE_ADDR="6.6.6.6")

        assert api.get(reverse("health"), REMOTE_ADDR="5.5.5.5").status_code == 200


class TestAiAgents:
    @pytest.mark.parametrize(
        "agent",
        [
            "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)",
            "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
            "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
            "Claude-User/1.0",
            "anthropic-ai",
            "Mozilla/5.0 (compatible; PerplexityBot/1.0)",
            "CCBot/2.0 (https://commoncrawl.org/faq/)",
            "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
            "meta-externalagent/1.1",
        ],
    )
    def test_known_ai_agents_cannot_use_the_api(self, api, agent):
        response = api.get("/api/songs/", HTTP_USER_AGENT=agent)

        assert response.status_code == 403
        assert "personas" in response.json()["detail"]

    def test_a_normal_browser_can(self, api, db):
        assert api.get("/api/songs/").status_code == 200

    def test_the_health_check_stays_open_for_uptime_monitors(self, api, db):
        assert api.get(reverse("health"), HTTP_USER_AGENT="ClaudeBot/1.0").status_code == 200

    def test_writes_are_blocked_too(self, api, db):
        response = api.post("/api/auth/register/", {"email": "a@b.co", "password": "una-clave-larga-1"}, format="json", HTTP_USER_AGENT="GPTBot/1.1")

        assert response.status_code == 403
        assert User.objects.count() == 0


@pytest.fixture
def turnstile(settings):
    settings.TURNSTILE_SECRET_KEY = "secreto-de-prueba"


def cloudflare_says(success):
    class Respuesta:
        def json(self):
            return {"success": success}

    return patch("core.human.requests.post", return_value=Respuesta())


class TestHumanCheck:
    GUESS = ("/api/daily/guess/", {"song_id": 1, "attempt_number": 1})

    def test_nothing_changes_until_a_turnstile_secret_is_configured(self, api, db):
        response = api.post(self.GUESS[0], self.GUESS[1], format="json", HTTP_X_DEVICE_ID=DEVICE)

        assert response.status_code != 403

    def test_without_a_pass_the_game_and_account_writes_are_refused_with_a_code_the_front_can_act_on(
        self, api, db, turnstile
    ):
        for url, body in [
            self.GUESS,
            ("/api/daily/score/", {"display_name": "x", "total_time_seconds": 5}),
            ("/api/auth/register/", {"email": "a@b.co", "password": "una-clave-larga-1"}),
            ("/api/auth/login/", {"email": "a@b.co", "password": "x"}),
            ("/api/auth/magic/request/", {"email": "a@b.co"}),
            ("/api/auth/password-reset/request/", {"email": "a@b.co"}),
        ]:
            response = api.post(url, body, format="json", HTTP_X_DEVICE_ID=DEVICE)

            assert response.status_code == 403, url
            assert response.json()["code"] == "human_check_required", url
        assert User.objects.count() == 0

    def test_a_valid_token_buys_a_pass_that_unlocks_them(self, api, db, turnstile):
        with cloudflare_says(True):
            bought = api.post("/api/human/", {"token": "token-de-turnstile"}, format="json")
        assert bought.status_code == 200 and bought.json()["pass"]

        response = api.post(
            self.GUESS[0], self.GUESS[1], format="json", HTTP_X_DEVICE_ID=DEVICE, HTTP_X_HUMAN_PASS=bought.json()["pass"]
        )

        assert response.status_code != 403

    def test_an_invalid_token_gets_no_pass(self, api, db, turnstile):
        with cloudflare_says(False):
            response = api.post("/api/human/", {"token": "inventado"}, format="json")

        assert response.status_code == 400
        assert "pass" not in response.json()

    @pytest.mark.parametrize("body", [{}, {"token": ""}, {"token": 5}, {"token": "x" * 5000}])
    def test_garbage_is_rejected_without_asking_cloudflare(self, api, db, turnstile, body):
        with patch("core.human.requests.post") as pedir:
            response = api.post("/api/human/", body, format="json")

        assert response.status_code == 400
        pedir.assert_not_called()

    def test_if_cloudflare_cannot_be_reached_nobody_gets_a_pass(self, api, db, turnstile):
        with patch("core.human.requests.post", side_effect=OSError("sin red")):
            response = api.post("/api/human/", {"token": "t"}, format="json")

        assert response.status_code == 400

    def test_a_pass_is_tied_to_the_visitor_that_bought_it(self, api, db, turnstile):
        with cloudflare_says(True):
            bought = api.post("/api/human/", {"token": "t"}, format="json", REMOTE_ADDR="1.1.1.1")

        elsewhere = api.post(
            self.GUESS[0], self.GUESS[1], format="json", HTTP_X_DEVICE_ID=DEVICE,
            HTTP_X_HUMAN_PASS=bought.json()["pass"], REMOTE_ADDR="2.2.2.2",
        )

        assert elsewhere.status_code == 403

    def test_a_pass_expires(self, api, db, turnstile, settings):
        with cloudflare_says(True):
            bought = api.post("/api/human/", {"token": "t"}, format="json")
        settings.HUMAN_PASS_TTL_SECONDS = -1

        late = api.post(
            self.GUESS[0], self.GUESS[1], format="json", HTTP_X_DEVICE_ID=DEVICE, HTTP_X_HUMAN_PASS=bought.json()["pass"]
        )

        assert late.status_code == 403

    @pytest.mark.parametrize("fake", ["", "abc", "a:b:c", "eyJ2IjoxfQ:1abc:zzzz"])
    def test_forged_passes_are_refused(self, api, db, turnstile, fake):
        response = api.post(self.GUESS[0], self.GUESS[1], format="json", HTTP_X_DEVICE_ID=DEVICE, HTTP_X_HUMAN_PASS=fake)

        assert response.status_code == 403

    def test_the_browser_may_send_the_pass_header_cross_origin(self, api, db):
        response = api.options(
            "/api/daily/guess/", HTTP_ORIGIN="http://localhost:3000",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST", HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-human-pass",
        )

        assert "x-human-pass" in response["Access-Control-Allow-Headers"].lower()

    def test_reading_the_game_state_does_not_need_the_pass(self, api, db, turnstile):
        assert api.get("/api/daily/", HTTP_X_DEVICE_ID=DEVICE).status_code != 403

    def test_the_human_endpoint_is_rate_limited(self, api, db, turnstile, rates):
        rates(human="2/hour")

        with cloudflare_says(False):
            codes = [api.post("/api/human/", {"token": "t"}, format="json").status_code for _ in range(4)]

        assert codes[-1] == 429


class TestCheapToServe:
    def test_the_song_list_is_not_rebuilt_on_every_request(self, api, db, django_assert_num_queries):
        artist = Artist.objects.create(mbid="a", name="A")
        Song.objects.create(mbid="s", title="T", album=Album.objects.create(mbid="al", name="Al", artist=artist))
        api.get("/api/songs/")

        with django_assert_num_queries(0):
            second = api.get("/api/songs/")

        assert second.status_code == 200 and len(second.json()["songs"]) == 1

    def test_a_new_song_shows_up(self, api, db):
        artist = Artist.objects.create(mbid="a", name="A")
        album = Album.objects.create(mbid="al", name="Al", artist=artist)
        Song.objects.create(mbid="s1", title="Uno", album=album)
        assert len(api.get("/api/songs/").json()["songs"]) == 1

        Song.objects.create(mbid="s2", title="Dos", album=album)

        assert len(api.get("/api/songs/").json()["songs"]) == 2

    def test_a_huge_request_body_is_refused_instead_of_read(self, api, db):
        huge = {"email": "a@b.co", "password": "x" * 400_000}

        response = api.post("/api/auth/register/", huge, format="json")

        assert response.status_code == 400
