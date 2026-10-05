"""Segmenting the songs that come up at random: include and exclude by year, genre, artist, kind of release, duration and song."""
import pytest
from rest_framework.exceptions import ValidationError

from battles.filters import clean_filters, pool
from catalog.models import Album, Artist, Song


@pytest.fixture
def catalog(db):
    """Six songs spread over the things a filter can look at (all visible and with a Deezer id)."""
    drexler = Artist.objects.create(mbid="a1", name="Jorge Drexler")
    nada = Artist.objects.create(mbid="a2", name="La Vela Puerca")
    rada = Artist.objects.create(mbid="a3", name="Rubén Rada")
    a1 = Album.objects.create(mbid="al1", name="Eco", artist=drexler, year=2004, genre="Pop", release_type="album")
    a2 = Album.objects.create(mbid="al2", name="A contraluz", artist=nada, year=2001, genre="Rock", release_type="album")
    a3 = Album.objects.create(mbid="al3", name="Candombe", artist=rada, year=1985, genre="Candombe", release_type="album")
    a4 = Album.objects.create(mbid="al4", name="Single suelto", artist=nada, year=2010, genre="rock", release_type="single")
    a5 = Album.objects.create(mbid="al5", name="Sin año", artist=rada, year=None, genre="", release_type="ep")
    make = lambda i, title, album, dur: Song.objects.create(mbid=f"s{i}", title=title, album=album, duration_seconds=dur, deezer_id=100 + i)
    return {
        "eco": make(1, "Al otro lado del río", a1, 194),
        "zafar": make(2, "Zafar", a2, 277),
        "candombe": make(3, "Candombe para Gardel", a3, 204),
        "single": make(4, "Un single", a4, 150),
        "sinanio": make(5, "Sin año", a5, None),
        "otra": make(6, "Otra de Drexler", a1, 240),
        "artists": {"drexler": drexler, "vela": nada, "rada": rada},
    }


def titles(filters):
    return {s.title for s in pool(clean_filters(filters))}


def test_no_filters_means_everything_visible_with_a_deezer_id(catalog):
    assert len(titles({})) == 6
    Song.objects.filter(title="Zafar").update(hidden=True)
    Song.objects.filter(title="Un single").update(deezer_id=None)
    assert "Zafar" not in titles({}) and "Un single" not in titles({})


def test_include_by_years(catalog):
    assert titles({"include": {"year_from": 2000, "year_to": 2005}}) == {"Al otro lado del río", "Zafar", "Otra de Drexler"}
    assert titles({"include": {"year_from": 2005}}) == {"Un single"}
    assert titles({"include": {"year_to": 1999}}) == {"Candombe para Gardel"}


def test_include_by_genre_ignores_case_and_takes_several(catalog):
    assert titles({"include": {"genres": ["rock"]}}) == {"Zafar", "Un single"}
    assert titles({"include": {"genres": ["Pop", "Candombe"]}}) == {"Al otro lado del río", "Otra de Drexler", "Candombe para Gardel"}


def test_include_by_artist_kind_and_duration(catalog):
    a = catalog["artists"]
    assert titles({"include": {"artists": [a["vela"].pk]}}) == {"Zafar", "Un single"}
    assert titles({"include": {"release_types": ["single", "ep"]}}) == {"Un single", "Sin año"}
    assert titles({"include": {"duration_min": 200, "duration_max": 250}}) == {"Candombe para Gardel", "Otra de Drexler"}


def test_filters_combine_with_and(catalog):
    assert titles({"include": {"genres": ["Rock"], "year_from": 2005}}) == {"Un single"}


def test_exclude_genres_artists_kinds_and_songs(catalog):
    a = catalog["artists"]
    assert "Zafar" not in titles({"exclude": {"genres": ["ROCK"]}}) and "Un single" not in titles({"exclude": {"genres": ["rock"]}})
    assert titles({"exclude": {"artists": [a["drexler"].pk, a["rada"].pk]}}) == {"Zafar", "Un single"}
    assert "Un single" not in titles({"exclude": {"release_types": ["single"]}})
    assert "Zafar" not in titles({"exclude": {"songs": [catalog["zafar"].pk]}})


def test_exclude_year_ranges_keeps_the_songs_without_a_year(catalog):
    left = titles({"exclude": {"years": [[2000, 2005], [2009, 2011]]}})
    assert left == {"Candombe para Gardel", "Sin año"}


def test_include_and_exclude_together(catalog):
    a = catalog["artists"]
    got = titles({"include": {"year_from": 2000}, "exclude": {"artists": [a["vela"].pk]}})
    assert got == {"Al otro lado del río", "Otra de Drexler"}


def test_an_empty_filter_filters_nothing(catalog):
    assert len(titles({"include": {"genres": [], "artists": []}, "exclude": {"songs": []}})) == 6


@pytest.mark.parametrize(
    "raw",
    [
        "texto",
        {"include": "x"},
        {"otro": {}},
        {"include": {"inventado": 1}},
        {"exclude": {"year_from": 2000}},
        {"include": {"year_from": "dos mil"}},
        {"include": {"year_from": 1800}},
        {"include": {"year_to": 2500}},
        {"include": {"year_from": 2010, "year_to": 2000}},
        {"include": {"genres": "Rock"}},
        {"include": {"genres": [3]}},
        {"include": {"artists": ["x"]}},
        {"include": {"release_types": ["disco"]}},
        {"include": {"duration_min": -1}},
        {"include": {"duration_min": 300, "duration_max": 100}},
        {"exclude": {"years": [[2000]]}},
        {"exclude": {"years": [[2010, 2000]]}},
        {"exclude": {"songs": [True]}},
        {"include": {"genres": ["x"] * 31}},
    ],
)
def test_bad_filters_are_rejected(raw):
    with pytest.raises(ValidationError):
        clean_filters(raw)


def test_clean_filters_normalizes():
    assert clean_filters(None) == {"include": {}, "exclude": {}}
    assert clean_filters({"include": {"genres": [" Rock ", ""], "year_from": 2000}}) == {"include": {"genres": ["Rock"], "year_from": 2000}, "exclude": {}}
