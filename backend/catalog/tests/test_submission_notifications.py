"""When someone writes from the site (contact form, a band asking to be added) the owner gets an email, so nobody has to look at the admin.
It never gets in the way: the message is stored first, and a provider failure, a missing address or the daily cap only mean no email."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import mail
from django.utils import timezone

from catalog.models import Submission

URL = "/api/catalog/reports/"


@pytest.fixture(autouse=True)
def recipient(settings):
    settings.CONTACT_NOTIFY_EMAIL = "hola@xami.uy"
    settings.CONTACT_NOTIFY_DAILY_CAP = 15
    settings.DEFAULT_FROM_EMAIL = "Banda Oriental <no-reply@xami.uy>"


def post(client, **body):
    return client.post(URL, body, content_type="application/json")


CONTACT = {"kind": "contacto", "name": "Ana Pérez", "contact": "ana@correo.com", "reason": "Algo no funciona", "message": "Se cuelga la reproducción en el celular."}


@pytest.mark.django_db
class TestContactEmail:
    def test_a_contact_message_is_emailed_to_the_owner_and_replying_goes_to_the_visitor(self, client):
        response = post(client, **CONTACT)

        assert response.status_code == 201
        assert len(mail.outbox) == 1
        email = mail.outbox[0]
        assert email.to == ["hola@xami.uy"]
        assert email.reply_to == ["ana@correo.com"]
        assert email.from_email == "Banda Oriental <no-reply@xami.uy>"
        assert "Algo no funciona" in email.subject and email.subject.startswith("Contacto")
        for text in ("Ana Pérez", "ana@correo.com", "Algo no funciona", "Se cuelga la reproducción en el celular."):
            assert text in email.body

    def test_the_reason_is_stored_apart_from_the_message(self, client):
        post(client, **CONTACT)

        item = Submission.objects.get()
        assert item.reason == "Algo no funciona" and item.message == CONTACT["message"]
        assert item.notified_at is not None

    def test_a_band_asking_to_be_added_is_emailed_too_but_replying_only_when_the_contact_is_an_email(self, client):
        post(client, kind="alta", name="Los Nadie", contact="@losnadie", links="https://open.spotify.com/artist/x", message="Somos de Salto")

        email = mail.outbox[0]
        assert email.subject.startswith("Sumar artista") and "Los Nadie" in email.subject
        assert email.reply_to == []
        assert "@losnadie" in email.body and "open.spotify.com" in email.body

    def test_mistakes_reported_in_the_archive_are_not_emailed_they_wait_in_the_admin(self, client):
        post(client, kind="error", target_type="artist", target_id=1, target_label="X", message="Está mal.")

        assert mail.outbox == []
        assert Submission.objects.get().notified_at is None

    def test_the_hidden_field_that_only_bots_fill_sends_nothing(self, client):
        post(client, **CONTACT, website="https://spam.example")

        assert mail.outbox == [] and Submission.objects.count() == 0


@pytest.mark.django_db
class TestNeverGetsInTheWay:
    def test_without_an_address_configured_the_message_is_stored_and_nothing_is_sent(self, client, settings):
        settings.CONTACT_NOTIFY_EMAIL = ""

        assert post(client, **CONTACT).status_code == 201
        assert mail.outbox == [] and Submission.objects.count() == 1

    def test_a_provider_failure_does_not_turn_into_an_error(self, client):
        with patch("catalog.notifications.EmailMessage.send", side_effect=RuntimeError("proveedor caído")):
            response = post(client, **CONTACT)

        assert response.status_code == 201
        item = Submission.objects.get()
        assert item.notified_at is None  # so it is known it was not sent

    def test_past_the_daily_cap_it_is_stored_but_not_emailed(self, client, settings):
        settings.CONTACT_NOTIFY_DAILY_CAP = 2
        for i in range(4):
            post(client, **{**CONTACT, "message": f"mensaje {i}"})

        assert len(mail.outbox) == 2 and Submission.objects.count() == 4

    def test_yesterdays_emails_do_not_count_for_todays_cap(self, client, settings):
        settings.CONTACT_NOTIFY_DAILY_CAP = 1
        Submission.objects.create(kind="contacto", message="viejo", notified_at=timezone.now() - timedelta(hours=30))

        post(client, **CONTACT)

        assert len(mail.outbox) == 1

    def test_what_the_visitor_wrote_cannot_inject_headers(self, client):
        post(client, **{**CONTACT, "reason": "Algo\r\nBcc: robo@malo.com", "name": "Ana\nBcc: robo@malo.com", "contact": "ana@correo.com\r\nBcc: robo@malo.com"})

        email = mail.outbox[0]
        assert "\n" not in email.subject and "\r" not in email.subject
        assert email.bcc == [] and email.reply_to != ["ana@correo.com\r\nBcc: robo@malo.com"]

    def test_a_contact_that_is_not_an_email_never_becomes_a_reply_to(self, client):
        post(client, **{**CONTACT, "contact": "no-es-un-correo"})

        assert mail.outbox[0].reply_to == []


@pytest.mark.django_db
class TestReason:
    def test_it_is_trimmed_and_limited(self, client):
        assert post(client, **{**CONTACT, "reason": "x" * 100}).status_code == 400
        assert post(client, **{**CONTACT, "reason": "  Tengo una duda  "}).status_code == 201
        assert Submission.objects.get().reason == "Tengo una duda"
