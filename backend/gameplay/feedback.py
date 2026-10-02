def calculate_feedback(guessed_song, target_song):
    """Compare a guessed Song against the target Song on 4 axes, from the
    guesser's point of view (spec §6): for "year", the value describes
    where the *correct* answer sits relative to the guess.
    """
    guessed_album = guessed_song.album
    target_album = target_song.album

    return {
        "year": _compare_year(guessed_album.year, target_album.year),
        "genre": _compare_exact(guessed_album.genre, target_album.genre),
        "artist": _compare_exact(guessed_album.artist_id, target_album.artist_id, same="same", different="different"),
        "album": _compare_exact(guessed_album.id, target_album.id, same="same", different="different"),
    }


def _compare_year(guessed_year, target_year):
    if guessed_year is None or target_year is None:
        return "unknown"
    if guessed_year == target_year:
        return "exact"
    return "newer" if target_year > guessed_year else "older"


def _compare_exact(guessed_value, target_value, *, same="same", different="different"):
    if not guessed_value or not target_value:
        return "unknown"
    return same if guessed_value == target_value else different
