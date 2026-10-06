"""Pictures attached to a message (a screenshot of what went wrong): validated by what the bytes really are, re-encoded (so metadata and
anything hidden in the file are gone), kept in the database, attached to the owner's email and shown in the admin only to staff."""

import io

import pytest
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from catalog.models import Submission, SubmissionImage

URL = "/api/catalog/reports/"
FORM = {"kind": "contacto", "name": "Ana", "contact": "ana@correo.com", "reason": "Algo no funciona", "message": "Mirá esta captura."}


@pytest.fixture(autouse=True)
def recipient(settings):
    settings.CONTACT_NOTIFY_EMAIL = "hola@xami.uy"
    settings.CONTACT_NOTIFY_DAILY_CAP = 15


def picture(fmt="PNG", size=(120, 80), name=None, color=(200, 30, 30)):
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, fmt)
    ext = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp", "GIF": "gif"}[fmt]
    return SimpleUploadedFile(name or f"captura.{ext}", out.getvalue(), content_type=f"image/{ext}")


def post(client, files=(), **extra):
    return client.post(URL, {**FORM, **extra, **({"images": list(files)} if files else {})})  # multipart


@pytest.mark.django_db
class TestUpload:
    def test_the_pictures_are_stored_with_the_message_as_webp(self, client):
        response = post(client, [picture("PNG"), picture("JPEG")])

        assert response.status_code == 201
        item = Submission.objects.get()
        images = list(item.images.order_by("id"))
        assert len(images) == 2 and all(i.content_type == "image/webp" for i in images)
        assert Image.open(io.BytesIO(bytes(images[0].data))).format == "WEBP"

    def test_a_message_without_pictures_still_works_as_json_or_as_a_form(self, client):
        assert client.post(URL, FORM, content_type="application/json").status_code == 201
        assert post(client).status_code == 201
        assert SubmissionImage.objects.count() == 0

    def test_a_big_picture_is_shrunk_and_loses_its_metadata(self, client):
        out = io.BytesIO()
        big = Image.new("RGB", (3000, 2000), (10, 120, 200))
        exif = Image.Exif()
        exif[0x010E] = "datos privados de la cámara"
        big.save(out, "JPEG", exif=exif)

        post(client, [SimpleUploadedFile("foto.jpg", out.getvalue(), content_type="image/jpeg")])

        stored = Image.open(io.BytesIO(bytes(SubmissionImage.objects.get().data)))
        assert max(stored.size) == 1600 and stored.size == (1600, 1067)
        assert not stored.getexif()
        assert b"datos privados" not in bytes(SubmissionImage.objects.get().data)

    @pytest.mark.parametrize(
        "bad",
        [
            SimpleUploadedFile("x.png", b"<svg onload=alert(1)>", content_type="image/png"),
            SimpleUploadedFile("x.png", b"%PDF-1.4 no es una imagen", content_type="image/png"),
            SimpleUploadedFile("x.exe", b"MZ\x90\x00", content_type="application/octet-stream"),
        ],
    )
    def test_what_is_not_really_a_picture_is_rejected_whatever_its_name_says(self, client, bad):
        assert post(client, [bad]).status_code == 400
        assert Submission.objects.count() == 0  # nothing is stored when a picture is rejected

    def test_only_png_jpeg_and_webp_are_accepted(self, client):
        assert post(client, [picture("GIF")]).status_code == 400
        assert post(client, [picture("WEBP")]).status_code == 201

    def test_at_most_three_pictures(self, client):
        assert post(client, [picture() for _ in range(4)]).status_code == 400
        assert post(client, [picture() for _ in range(3)]).status_code == 201

    def test_a_picture_over_five_megabytes_is_rejected(self, client):
        big = SimpleUploadedFile("grande.png", picture("PNG").read() + b"0" * (5 * 1024 * 1024 + 1), content_type="image/png")

        assert post(client, [big]).status_code == 400

    def test_an_enormous_resolution_is_rejected_before_it_is_decoded(self, client):
        out = io.BytesIO()
        Image.new("L", (9000, 9000)).save(out, "PNG")  # 81 megapixels, tiny file

        assert post(client, [SimpleUploadedFile("bomba.png", out.getvalue(), content_type="image/png")]).status_code == 400

    def test_the_bot_trap_discards_the_pictures_too(self, client):
        post(client, [picture()], website="https://spam.example")

        assert Submission.objects.count() == 0 and SubmissionImage.objects.count() == 0


@pytest.mark.django_db
class TestEmailAndAdmin:
    def test_the_owner_gets_the_pictures_attached_to_the_email(self, client):
        post(client, [picture("PNG"), picture("JPEG")])

        email = mail.outbox[0]
        assert [a[0] for a in email.attachments] == ["imagen-1.webp", "imagen-2.webp"]
        assert all(a[2] == "image/webp" for a in email.attachments)
        assert "2 imágenes adjuntas" in email.body

    def test_a_mistake_report_keeps_its_pictures_in_the_admin_without_emailing(self, client):
        post(client, [picture()], kind="error", target_type="artist", target_id=1, target_label="X")

        assert mail.outbox == [] and SubmissionImage.objects.count() == 1

    def test_the_admin_shows_them_and_only_staff_can_open_them(self, client):
        post(client, [picture()])
        image = SubmissionImage.objects.get()
        url = f"/admin/catalog/submission/imagen/{image.pk}/"

        assert client.get(url).status_code == 302  # to the login
        staff = get_user_model().objects.create_superuser("root", "r@x.com", "x")
        client.force_login(staff)
        response = client.get(url)
        assert response.status_code == 200
        assert response["Content-Type"] == "image/webp" and response["X-Content-Type-Options"] == "nosniff"
        assert "default-src 'none'" in response["Content-Security-Policy"]

    def test_the_admin_detail_has_an_inline_with_the_pictures(self):
        from catalog.admin import SubmissionAdmin

        inlines = [i.model for i in SubmissionAdmin(Submission, admin.site).inlines]

        assert SubmissionImage in inlines
