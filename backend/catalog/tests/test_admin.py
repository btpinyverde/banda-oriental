from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

User = get_user_model()


@pytest.fixture
def staff_client(client, db):
    user = User.objects.create_superuser(
        username="admin@example.com", email="admin@example.com", password="pw"
    )
    client.force_login(user)
    return client


@pytest.mark.django_db
def test_sync_action_calls_the_management_command(staff_client):
    from catalog.models import Artist

    Artist.objects.create(mbid="a1", name="Artist One")

    with patch("catalog.admin.call_command") as mock_call_command:
        response = staff_client.post(
            reverse("admin:catalog_artist_changelist"),
            {
                "action": "sync_with_musicbrainz",
                "_selected_action": [str(Artist.objects.get().pk)],
            },
            follow=True,
        )

    assert response.status_code == 200
    mock_call_command.assert_called_once_with("sync_musicbrainz")
