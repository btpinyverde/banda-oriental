"""The artists the landing shows (chosen and ordered from the admin, each with a cutout photo)."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from catalog.admin import FeaturedArtistForm
from catalog.models import Album, Artist, FeaturedArtist, Song

BASE = "/api/catalog/featured/"


def png_bytes(size=(40, 50), color=(10, 20, 30, 0), fmt="PNG"):
    out = io.BytesIO()
    Image.new("RGBA", size, color).save(out, fmt)
    return out.getvalue()


def make_artist(name, songs=1):
    artist = Artist.objects.create(mbid=f"mb-{name}", name=name)
    album = Album.objects.create(mbid=f"al-{name}", name=f"Disco de {name}", artist=artist, year=1990)
    for i in range(songs):
        Song.objects.create(mbid=f"s-{name}-{i}", title=f"Tema {i}", album=album)
    return artist


def feature(artist, position=0, active=True, data=None):
    return FeaturedArtist.objects.create(
        artist=artist, position=position, active=active, image=data or png_bytes(), image_type="image/png"
    )


@pytest.mark.django_db
class TestFeaturedList:
    def test_lists_active_ones_in_order_with_the_artist_data(self, client):
        a, b, c = make_artist("Ana", 3), make_artist("Beto"), make_artist("Carla")
        feature(b, position=2)
        feature(a, position=1)
        feature(c, position=0, active=False)

        body = client.get(BASE).json()

        assert [r["name"] for r in body["results"]] == ["Ana", "Beto"]
        first = body["results"][0]
        assert first["id"] == a.id and first["songs"] == 3 and first["first_year"] == 1990
        assert first["photo_url"].startswith(f"/api/catalog/featured/{a.id}/image/?v=")

    def test_is_empty_when_nothing_is_featured(self, client):
        assert client.get(BASE).json() == {"results": []}

    def test_an_artist_without_readable_songs_is_left_out(self, client):
        feature(Artist.objects.create(mbid="vacio", name="Vacío"))
        assert client.get(BASE).json()["results"] == []

    def test_is_cacheable(self, client):
        assert "max-age" in client.get(BASE)["Cache-Control"]


@pytest.mark.django_db
class TestFeaturedImage:
    def test_serves_the_bytes_with_their_type_and_long_cache(self, client):
        a = make_artist("Ana")
        data = png_bytes()
        feature(a, data=data)

        response = client.get(f"{BASE}{a.id}/image/")

        assert response.status_code == 200
        assert response["Content-Type"] == "image/png"
        assert response.content == data
        assert "max-age=86400" in response["Cache-Control"]
        assert response["X-Content-Type-Options"] == "nosniff"

    def test_an_inactive_or_missing_one_is_404(self, client):
        a = make_artist("Ana")
        feature(a, active=False)
        assert client.get(f"{BASE}{a.id}/image/").status_code == 404
        assert client.get(f"{BASE}999999/image/").status_code == 404


@pytest.mark.django_db
class TestAdminForm:
    def data(self, artist):
        return {"artist": artist.id, "position": 1, "active": True}

    def upload(self, content, name="foto.png", content_type="image/png"):
        return {"photo": SimpleUploadedFile(name, content, content_type=content_type)}

    def test_stores_a_png_cutout(self):
        a = make_artist("Ana")
        form = FeaturedArtistForm(self.data(a), self.upload(png_bytes()))
        assert form.is_valid(), form.errors
        saved = form.save()
        assert bytes(saved.image) == png_bytes() and saved.image_type == "image/png"

    def test_accepts_webp(self):
        a = make_artist("Ana")
        form = FeaturedArtistForm(self.data(a), self.upload(png_bytes(fmt="WEBP"), "f.webp", "image/webp"))
        assert form.is_valid(), form.errors
        assert form.save().image_type == "image/webp"

    def test_a_photo_is_required_the_first_time(self):
        form = FeaturedArtistForm(self.data(make_artist("Ana")), {})
        assert not form.is_valid() and "photo" in form.errors

    def test_editing_without_a_new_photo_keeps_the_old_one(self):
        a = make_artist("Ana")
        item = feature(a)
        form = FeaturedArtistForm({"artist": a.id, "position": 5, "active": True}, {}, instance=item)
        assert form.is_valid(), form.errors
        saved = form.save()
        assert saved.position == 5 and bytes(saved.image) == png_bytes()

    def test_rejects_a_jpeg_and_things_that_are_not_images(self):
        a = make_artist("Ana")
        out = io.BytesIO()
        Image.new("RGB", (10, 10)).save(out, "JPEG")
        assert not FeaturedArtistForm(self.data(a), self.upload(out.getvalue(), "f.jpg", "image/jpeg")).is_valid()
        assert not FeaturedArtistForm(self.data(a), self.upload(b"<svg onload=alert(1)>", "f.png")).is_valid()

    def test_rejects_a_photo_that_is_too_heavy(self):
        a = make_artist("Ana")
        big = png_bytes((1200, 1200)) + b"0" * (2 * 1024 * 1024)
        form = FeaturedArtistForm(self.data(a), self.upload(big))
        assert not form.is_valid() and "photo" in form.errors
