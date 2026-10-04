import pytest

ORIGIN = "http://localhost:3000"  # config.settings.dev allows it when CORS_ALLOWED_ORIGINS is empty


def _preflight(client, headers):
    return client.options(
        "/api/daily/",
        HTTP_ORIGIN=ORIGIN,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS=headers,
    )


@pytest.mark.django_db
def test_the_browser_may_send_the_device_id_header_cross_origin(client):
    # The frontend identifies the player with X-Device-Id (a custom header). Without it in
    # Access-Control-Allow-Headers the preflight fails and the browser blocks every game call.
    response = _preflight(client, "x-device-id")

    allowed = response["Access-Control-Allow-Headers"].lower()
    assert "x-device-id" in allowed


@pytest.mark.django_db
def test_the_usual_headers_stay_allowed(client):
    response = _preflight(client, "content-type")

    allowed = response["Access-Control-Allow-Headers"].lower()
    assert "content-type" in allowed
    assert "x-device-id" in allowed
