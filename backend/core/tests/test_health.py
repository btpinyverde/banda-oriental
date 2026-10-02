from unittest.mock import patch

import pytest
from django.db import InterfaceError, OperationalError
from django.urls import reverse
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_health_returns_ok_when_db_reachable():
    client = APIClient()
    response = client.get(reverse("health"))
    assert response.status_code == 200
    assert response.data == {"status": "ok", "db": "ok"}


def test_health_returns_503_when_db_unreachable():
    client = APIClient()
    with patch("core.views.connection") as mock_connection:
        mock_connection.cursor.side_effect = OperationalError("could not connect")
        response = client.get(reverse("health"))
    assert response.status_code == 503
    assert response.data == {"status": "error", "db": "unreachable"}


def test_health_returns_503_on_stale_pooled_connection():
    client = APIClient()
    with patch("core.views.connection") as mock_connection:
        mock_connection.cursor.side_effect = InterfaceError("connection already closed")
        response = client.get(reverse("health"))
    assert response.status_code == 503
    assert response.data == {"status": "error", "db": "unreachable"}


@pytest.mark.django_db
def test_health_returns_json_for_a_real_browser_accept_header():
    client = APIClient()
    response = client.get(
        reverse("health"),
        HTTP_ACCEPT="text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    )
    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/json")
