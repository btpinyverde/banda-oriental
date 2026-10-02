from unittest.mock import patch

import pytest
from django.db.utils import OperationalError
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
