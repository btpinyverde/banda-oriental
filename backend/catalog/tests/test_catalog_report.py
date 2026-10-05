from io import StringIO

import pytest
from django.core.management import call_command

from catalog.models import Album, Artist, Song


def report():
    out = StringIO()
    call_command("catalog_report", stdout=out)
    return out.getvalue()


@pytest.fixture
def data(db):
    full = Artist.objects.create(mbid="a1", name="Con todo", deezer_id=5)
    bare = Artist.objects.create(mbid="a2", name="Sin nada")
    Artist.objects.create(mbid="a3", name="Sin discos")
    ok = Album.objects.create(mbid="al1", name="Completo", artist=full, year=1996, genre="Rock", cover_art_url="http://x/c.jpg")
    empty = Album.objects.create(mbid="al2", name="Pelado", artist=bare)
    Song.objects.create(mbid="s1", title="Uno", album=ok, duration_seconds=200)
    Song.objects.create(mbid="s2", title="Dos", album=empty)
    Song.objects.create(mbid="s3", title="Dos", album=empty, hidden=True, hidden_reason="duplicate")
    return {"ok": ok, "empty": empty}


def line(text, label):
    return next(row for row in text.splitlines() if label in row)


def test_it_counts_what_there_is_and_what_is_missing(data):
    text = report()

    assert "Artistas: 3" in text and "Discos: 2" in text and "Canciones: 3" in text
    assert "1 de 2" in line(text, "Discos sin género")
    assert "1 de 2" in line(text, "Discos sin año")
    assert "1 de 2" in line(text, "Discos sin portada")
    assert "1 de 2" in line(text, "Canciones sin duración")  # the hidden one is not counted


def test_it_counts_the_artists_with_nothing_to_show_and_the_ones_not_matched_with_deezer(data):
    text = report()

    assert "Artistas sin discos: 1" in text
    assert "Artistas sin emparejar con Deezer: 2" in text


def test_it_says_how_many_songs_are_hidden_and_why(data):
    text = report()

    assert "Canciones ocultas: 1" in text
    assert "duplicate: 1" in text


def test_it_warns_of_what_clean_catalog_would_do(data):
    Album.objects.create(mbid="al9", name="Otro", artist=Artist.objects.get(mbid="a1"), year=2000, genre="rock")

    text = report()

    assert "Géneros escritos de varias formas" in text
    assert "Rock" in text and "rock" in text


def test_it_does_not_change_anything(data):
    before = (Artist.objects.count(), Album.objects.count(), Song.objects.count(), Song.objects.filter(hidden=True).count())

    report()

    assert before == (Artist.objects.count(), Album.objects.count(), Song.objects.count(), Song.objects.filter(hidden=True).count())


def test_it_works_on_an_empty_catalog(db):
    assert "Canciones: 0" in report()
