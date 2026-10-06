import pytest
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import RequestFactory

from catalog import verification as v
from catalog.admin import ArtistAdmin
from catalog.models import Album, Artist, Song


def build(status):
    artist = Artist.objects.create(mbid="mb-x", name="Cabrera", deezer_id=1, deezer_status=status)
    record = Album.objects.create(deezer_id=21, name="Del otro", artist=artist)
    Song.objects.create(deezer_id=31, title="Tema", album=record)
    return artist


def run_action(name, queryset):
    model_admin = ArtistAdmin(Artist, admin.site)
    request = RequestFactory().post("/")
    request.user = get_user_model().objects.create_superuser("root", "r@x.com", "x")
    request._messages = type("M", (), {"add": lambda *a, **k: None})()
    getattr(model_admin, name)(request, queryset)


@pytest.mark.django_db
class TestActions:
    def test_confirming_by_hand_marks_it_verified_and_brings_back_what_was_hidden(self):
        artist = build(v.UNVERIFIED)
        v.hide_unverified()
        assert Song.objects.get().hidden is True

        run_action("confirmar_emparejado", Artist.objects.filter(pk=artist.pk))

        artist.refresh_from_db()
        assert (artist.deezer_status, artist.deezer_source) == (v.VERIFIED, "manual")
        assert Song.objects.get().hidden is False

    def test_marking_it_wrong_hides_what_only_deezer_brought(self):
        artist = build(v.VERIFIED)

        run_action("marcar_equivocado", Artist.objects.filter(pk=artist.pk))

        artist.refresh_from_db()
        assert artist.deezer_status == v.WRONG
        assert Song.objects.get().hidden is True

    def test_the_list_shows_and_filters_by_status(self):
        model_admin = ArtistAdmin(Artist, admin.site)

        assert "deezer_status" in model_admin.list_display
        assert "deezer_status" in model_admin.list_filter
