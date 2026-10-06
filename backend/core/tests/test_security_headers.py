import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_every_answer_carries_the_basic_security_headers(client):
    response = client.get(reverse("health"))

    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["X-Frame-Options"] == "DENY"  # nobody embeds the API or the admin in a frame (clickjacking)
    assert response["Referrer-Policy"] == "same-origin"


@pytest.mark.django_db
def test_the_api_errors_carry_them_too(client):
    response = client.get("/api/no-existe/")

    assert response.status_code == 404
    assert response["X-Content-Type-Options"] == "nosniff"
