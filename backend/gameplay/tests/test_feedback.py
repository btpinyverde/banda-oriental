import pytest

from catalog.models import Album, Artist, Song
from gameplay.feedback import calculate_feedback


def _song(title, *, artist_name, album_name, year=None, genre=""):
    artist, _ = Artist.objects.get_or_create(mbid=f"artist-{artist_name}", defaults={"name": artist_name})
    album, _ = Album.objects.get_or_create(
        mbid=f"album-{album_name}",
        defaults={"name": album_name, "artist": artist, "year": year, "genre": genre},
    )
    return Song.objects.create(mbid=f"song-{title}", title=title, album=album)


@pytest.mark.django_db
def test_exact_match_on_every_axis():
    target = _song("Luna negra", artist_name="Jorge Drexler", album_name="Vaivén", year=1996, genre="folk")
    guess = _song("Otra de Drexler", artist_name="Jorge Drexler", album_name="Vaivén", year=1996, genre="folk")

    feedback = calculate_feedback(guess, target)

    assert feedback == {"year": "exact", "genre": "same", "artist": "same", "album": "same"}


@pytest.mark.django_db
def test_guess_year_is_older_than_target():
    target = _song("Target", artist_name="A", album_name="Target Album", year=2000)
    guess = _song("Guess", artist_name="B", album_name="Guess Album", year=1990)

    feedback = calculate_feedback(guess, target)

    # The guessed song is from 1990, the target is from 2000 — relative to
    # the guess, the correct answer is *newer*.
    assert feedback["year"] == "newer"


@pytest.mark.django_db
def test_guess_year_is_newer_than_target():
    target = _song("Target", artist_name="A", album_name="Target Album", year=1990)
    guess = _song("Guess", artist_name="B", album_name="Guess Album", year=2000)

    feedback = calculate_feedback(guess, target)

    assert feedback["year"] == "older"


@pytest.mark.django_db
def test_year_unknown_when_either_song_has_no_year():
    target = _song("Target", artist_name="A", album_name="Target Album", year=None)
    guess = _song("Guess", artist_name="B", album_name="Guess Album", year=2000)

    feedback = calculate_feedback(guess, target)

    assert feedback["year"] == "unknown"


@pytest.mark.django_db
def test_genre_unknown_when_either_song_has_blank_genre():
    target = _song("Target", artist_name="A", album_name="Target Album", genre="")
    guess = _song("Guess", artist_name="B", album_name="Guess Album", genre="rock")

    feedback = calculate_feedback(guess, target)

    assert feedback["genre"] == "unknown"


@pytest.mark.django_db
def test_different_artist_and_album():
    target = _song("Target", artist_name="Jorge Drexler", album_name="Vaivén")
    guess = _song("Guess", artist_name="No Te Va Gustar", album_name="Otra cosa")

    feedback = calculate_feedback(guess, target)

    assert feedback["artist"] == "different"
    assert feedback["album"] == "different"


@pytest.mark.django_db
def test_same_artist_different_album():
    artist, _ = Artist.objects.get_or_create(mbid="shared-artist", defaults={"name": "Jorge Drexler"})
    target_album = Album.objects.create(mbid="album-1", name="Vaivén", artist=artist)
    guess_album = Album.objects.create(mbid="album-2", name="Salvavidas de hielo", artist=artist)
    target = Song.objects.create(mbid="song-target", title="Target", album=target_album)
    guess = Song.objects.create(mbid="song-guess", title="Guess", album=guess_album)

    feedback = calculate_feedback(guess, target)

    assert feedback["artist"] == "same"
    assert feedback["album"] == "different"
