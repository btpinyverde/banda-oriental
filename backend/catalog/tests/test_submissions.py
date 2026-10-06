"""Reports of a mistake in the archive, bands asking to be added, and messages: stored for the admin to read."""

import pytest
from django.contrib import admin

from catalog.admin import SubmissionAdmin
from catalog.models import Album, Artist, Song, Submission

URL = "/api/catalog/reports/"


@pytest.fixture
def song(db):
    artist = Artist.objects.create(mbid="mb-1", name="Fernando Cabrera")
    album = Album.objects.create(mbid="al-1", name="Viento del Sur", artist=artist)
    return Song.objects.create(mbid="s-1", title="Tema", album=album), album, artist


def post(client, **body):
    return client.post(URL, body, content_type="application/json")


@pytest.mark.django_db
class TestCreate:
    def test_a_report_about_an_artist_is_stored_with_the_real_name_not_the_one_the_visitor_sent(self, client, song):
        _, _, artist = song

        response = post(client, kind="error", target_type="artist", target_id=artist.id, target_label="LO QUE SEA", message="Tiene discos de otro Fernando Cabrera.")

        assert response.status_code == 201
        item = Submission.objects.get()
        assert (item.kind, item.target_type, item.target_id, item.target_label) == ("error", "artist", artist.id, "Fernando Cabrera")
        assert item.status == "nuevo" and "otro Fernando" in item.message

    def test_albums_and_songs_resolve_their_label_too(self, client, song):
        s, album, _ = song
        post(client, kind="error", target_type="album", target_id=album.id, message="El año está mal.")
        post(client, kind="error", target_type="song", target_id=s.id, message="No es de este disco.")

        assert list(Submission.objects.order_by("id").values_list("target_label", flat=True)) == ["Viento del Sur", "Tema"]

    def test_a_target_that_does_not_exist_keeps_what_the_visitor_wrote_trimmed(self, client, db):
        post(client, kind="error", target_type="artist", target_id=999999, target_label="  Un artista  ", message="No existe.")

        assert Submission.objects.get().target_label == "Un artista"

    def test_an_error_needs_a_message(self, client, db):
        assert post(client, kind="error", target_type="artist", target_id=1, message="  ").status_code == 400
        assert Submission.objects.count() == 0

    def test_a_band_asking_to_be_added_needs_name_and_a_way_to_reach_it(self, client, db):
        assert post(client, kind="alta", name="Los Nadie", message="Somos de Salto").status_code == 400  # no contact
        assert post(client, kind="alta", contact="los@nadie.uy", message="Somos de Salto").status_code == 400  # no name

        ok = post(client, kind="alta", name="Los Nadie", contact="los@nadie.uy", links="https://open.spotify.com/artist/xyz", message="Somos de Salto")

        assert ok.status_code == 201
        item = Submission.objects.get()
        assert (item.name, item.contact, item.links) == ("Los Nadie", "los@nadie.uy", "https://open.spotify.com/artist/xyz")

    def test_a_message_needs_text(self, client, db):
        assert post(client, kind="contacto", message="").status_code == 400
        assert post(client, kind="contacto", message="Hola, tengo una duda.").status_code == 201

    @pytest.mark.parametrize(
        "body",
        [
            {"kind": "otra", "message": "hola hola"},
            {"kind": "error", "target_type": "disco", "target_id": 1, "message": "mensaje ok"},
            {"kind": "error", "target_type": "artist", "target_id": 1, "message": "x" * 3000},
            {"kind": "error", "target_type": "artist", "target_id": "abc", "message": "mensaje ok"},
        ],
    )
    def test_invalid_things_are_rejected(self, client, db, body):
        assert post(client, **body).status_code == 400
        assert Submission.objects.count() == 0

    def test_the_hidden_field_that_only_bots_fill_is_answered_ok_but_stores_nothing(self, client, db):
        response = post(client, kind="contacto", message="Comprá relojes baratos", website="https://spam.example")

        assert response.status_code == 201
        assert Submission.objects.count() == 0

    def test_the_text_is_stored_as_text_not_markup_and_trimmed(self, client, db):
        post(client, kind="contacto", message="  <script>alert(1)</script> hola  ")

        assert Submission.objects.get().message == "<script>alert(1)</script> hola"  # shown escaped in the admin; never rendered as HTML

    def test_it_is_limited_per_visitor(self, client, db):
        statuses = [post(client, kind="contacto", message=f"mensaje {i}").status_code for i in range(12)]

        assert statuses[0] == 201 and 429 in statuses

    def test_only_post_is_allowed(self, client, db):
        assert client.get(URL).status_code == 405


@pytest.mark.django_db
class TestAdmin:
    def test_the_list_shows_what_matters_and_can_be_filtered(self):
        model_admin = SubmissionAdmin(Submission, admin.site)

        assert {"kind", "status", "created_at"} <= set(model_admin.list_display)
        assert "kind" in model_admin.list_filter and "status" in model_admin.list_filter

    def test_what_the_visitor_wrote_cannot_be_edited_only_the_status(self):
        model_admin = SubmissionAdmin(Submission, admin.site)

        assert "status" not in model_admin.readonly_fields
        assert {"message", "contact", "name"} <= set(model_admin.readonly_fields)
