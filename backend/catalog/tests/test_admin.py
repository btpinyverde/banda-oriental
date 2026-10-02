from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

from catalog.models import Artist, SyncState

User = get_user_model()


@pytest.fixture
def staff_client(client, db):
    user = User.objects.create_superuser(
        username="admin@example.com", email="admin@example.com", password="pw"
    )
    client.force_login(user)
    return client


@pytest.mark.django_db
def test_sync_action_works_on_a_completely_empty_database(staff_client):
    # This is the real-world first run: zero Artists, zero Albums. The
    # trigger must still be reachable — it used to live on Artist's
    # changelist, which has no rows (and no action dropdown) until
    # something has already been synced.
    assert Artist.objects.count() == 0
    state = SyncState.objects.get(pk=1)  # created by migration 0002

    with patch("catalog.admin.call_command") as mock_call_command:
        response = staff_client.post(
            reverse("admin:catalog_syncstate_changelist"),
            {
                "action": "sync_with_musicbrainz",
                "_selected_action": [str(state.pk)],
            },
            follow=True,
        )

    assert response.status_code == 200
    mock_call_command.assert_called_once_with("sync_musicbrainz")
