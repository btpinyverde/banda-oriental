"""The parts of the API a person can see with a browser carry the brand: the admin (login included), the root of the
API and the 404 page. The API itself keeps answering JSON."""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.staticfiles import finders
from django.test import override_settings
from django.urls import reverse

User = get_user_model()
BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"


@pytest.fixture
def browser(client):
    client.defaults["HTTP_USER_AGENT"] = BROWSER
    client.defaults["HTTP_ACCEPT"] = "text/html,application/xhtml+xml"
    return client


class TestTheRootOfTheApi:
    def test_a_browser_gets_a_page_instead_of_an_error(self, browser):
        response = browser.get("/")

        assert response.status_code == 200
        page = response.content.decode()
        assert "Banda Oriental" in page
        assert 'lang="es"' in page

    @override_settings(FRONTEND_URL="https://bandaoriental.xami.uy")
    def test_it_points_to_the_game_and_to_the_health_check(self, browser):
        page = browser.get("/").content.decode()

        assert 'href="https://bandaoriental.xami.uy"' in page
        assert 'href="/api/health/"' in page

    def test_it_asks_search_engines_not_to_index_it(self, browser):
        response = browser.get("/")

        assert 'name="robots" content="noindex' in response.content.decode()
        assert "noindex" in response.headers.get("X-Robots-Tag", "")

    @override_settings(FRONTEND_URL="https://bandaoriental.xami.uy")
    def test_a_program_asking_for_json_gets_json(self, client):
        response = client.get("/", HTTP_ACCEPT="application/json")

        assert response.status_code == 200
        assert response.json() == {
            "name": "Banda Oriental API",
            "status": "ok",
            "site": "https://bandaoriental.xami.uy",
            "health": "/api/health/",
        }

    def test_it_is_read_only(self, client):
        assert client.post("/").status_code == 405

    def test_robots_txt_keeps_crawlers_off_the_api(self, client):
        response = client.get("/robots.txt")

        assert response.status_code == 200
        assert response["Content-Type"].startswith("text/plain")
        assert "Disallow: /" in response.content.decode()


class TestTheAdminCarriesTheBrand:
    def test_the_login_page_has_the_logo_the_name_and_the_brand_stylesheet(self, browser):
        page = browser.get(reverse("admin:login")).content.decode()

        assert "Banda Oriental" in page
        assert "logo-banda-oriental" in page
        assert "banda-oriental.css" in page
        assert "Django administration" not in page and "Administración de Django" not in page

    def test_the_login_page_says_what_it_is_for_and_links_back_to_the_game(self, browser, settings):
        settings.FRONTEND_URL = "https://bandaoriental.xami.uy"

        page = browser.get(reverse("admin:login")).content.decode()

        assert "Administración" in page
        assert 'href="https://bandaoriental.xami.uy"' in page

    def test_once_inside_the_pages_are_titled_with_the_brand_not_with_django(self, browser, db):
        browser.force_login(User.objects.create_superuser("a@b.c", "a@b.c", "pw"))

        page = browser.get(reverse("admin:index")).content.decode()

        assert "Banda Oriental" in page
        assert "Django administration" not in page and "Administración de Django" not in page
        assert "Administración" in page

    @pytest.mark.parametrize("asset", ["admin/banda-oriental.css", "admin/logo-banda-oriental.png", "admin/logo-banda-oriental-claro.png"])
    def test_the_brand_files_exist_and_are_found_as_static_files(self, asset):
        assert finders.find(asset) is not None

    def test_the_stylesheet_uses_the_colours_of_the_game(self):
        css = open(finders.find("admin/banda-oriental.css"), encoding="utf-8").read().lower()

        for colour in ("#6c4ff0", "#fbf8f1", "#fde668"):  # violet, cream, yellow
            assert colour in css

    def test_the_dark_theme_is_covered_too(self):
        css = open(finders.find("admin/banda-oriental.css"), encoding="utf-8").read()

        assert 'data-theme="dark"' in css


class TestTheLogoIsSeenOnDarkBackgrounds:
    """The logo's lettering is black: on a dark background it vanishes, so those places use the light version."""

    def test_the_admin_header_uses_the_light_logo(self, browser):
        assert "logo-banda-oriental-claro" in browser.get(reverse("admin:login")).content.decode()

    @pytest.mark.parametrize("path", ["/", "/no-existe/"])
    def test_the_public_pages_switch_to_the_light_logo_when_the_browser_is_dark(self, browser, path):
        page = browser.get(path).content.decode()

        assert 'media="(prefers-color-scheme: dark)"' in page and "logo-banda-oriental-claro" in page


    def test_the_light_logo_really_has_no_black_lettering_left(self):
        from PIL import Image

        image = Image.open(finders.find("admin/logo-banda-oriental-claro.png")).convert("RGBA")
        dark_opaque = [p for p in image.getdata() if p[3] > 200 and max(p[:3]) < 80]

        assert dark_opaque == []


class TestThe404Page:
    def test_a_browser_gets_a_branded_page(self, browser):
        response = browser.get("/no-existe/")

        assert response.status_code == 404
        page = response.content.decode()
        assert "Banda Oriental" in page and "no encontramos" in page.lower()

    def test_the_api_keeps_answering_json(self, client):
        response = client.get("/api/no-existe/", HTTP_ACCEPT="application/json")

        assert response.status_code == 404
        assert response.json() == {"detail": "No encontrado."}
