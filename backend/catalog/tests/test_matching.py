from catalog.matching import base_title, is_wanted_release, normalize_text, pick_artist


def _artist(deezer_id, name, nb_album=0, nb_fan=0):
    return {"id": deezer_id, "name": name, "nb_album": nb_album, "nb_fan": nb_fan}


class TestNormalizeText:
    def test_ignores_case_accents_and_punctuation(self):
        assert normalize_text("Rubén  Rada!") == normalize_text("ruben rada")

    def test_keeps_different_words_different(self):
        assert normalize_text("No Te Va Gustar") != normalize_text("No Te Va A Gustar")

    def test_empty_and_symbols_only(self):
        assert normalize_text("") == ""
        assert normalize_text("...") == ""


class TestPickArtist:
    def test_picks_exact_name_ignoring_accents(self):
        candidates = [_artist(1, "Mariah Carey", 120, 3000000), _artist(2, "Leo Masliah", 96, 1976)]

        assert pick_artist(candidates, "Leo Maslíah")["id"] == 2

    def test_among_same_name_prefers_the_one_with_most_albums(self):
        candidates = [_artist(1, "Jorge Drexler", 0, 0), _artist(2, "Jorge Drexler", 43, 91330)]

        assert pick_artist(candidates, "Jorge Drexler")["id"] == 2

    def test_ties_on_albums_are_broken_by_fans(self):
        candidates = [_artist(1, "Ana", 5, 10), _artist(2, "Ana", 5, 900)]

        assert pick_artist(candidates, "Ana")["id"] == 2

    def test_ignores_collaboration_profiles_with_a_different_name(self):
        candidates = [_artist(1, "Trueno & Rubén Rada", 0, 0), _artist(2, "Nicolas Sosa, Ruben Rada", 0, 1)]

        assert pick_artist(candidates, "Rubén Rada") is None

    def test_never_guesses_a_near_miss(self):
        candidates = [_artist(1, "NOTEVAGUSTAR", 0, 5115), _artist(2, "No Te Va A Gustar", 0, 20218)]

        assert pick_artist(candidates, "No Te Va Gustar") is None

    def test_exact_match_with_no_albums_is_rejected(self):
        # Perfiles vacíos: no sirven para completar nada.
        assert pick_artist([_artist(1, "Jorge Drexler", 0, 0)], "Jorge Drexler") is None

    def test_no_candidates(self):
        assert pick_artist([], "Cualquiera") is None


class TestIsWantedRelease:
    def test_accepts_albums_eps_and_singles(self):
        assert is_wanted_release("Vaivén", "album")
        assert is_wanted_release("Cara B", "ep")
        assert is_wanted_release("Luna Llena", "single")

    def test_rejects_compilations_and_unknown_types(self):
        assert not is_wanted_release("Grandes éxitos", "compile")
        assert not is_wanted_release("Algo", "")

    def test_rejects_live_remix_karaoke_and_instrumental_versions(self):
        for titulo in [
            "Sesiones Pegaso (En Vivo)",
            "Montevideo (Live at Teatro Solís)",
            "Luna negra (Remix)",
            "Luna negra - Karaoke Version",
            "Luna negra (Instrumental)",
        ]:
            assert not is_wanted_release(titulo, "album"), titulo

    def test_rejects_live_marked_only_as_vivo_in_brackets_or_after_a_dash(self):
        for titulo in ["Chau Ft. Julieta Venegas (Vivo)", "Chau [Vivo]", "Chau - Live", "Chau - En Vivo en Montevideo"]:
            assert not is_wanted_release(titulo, "single"), titulo

    def test_keeps_titles_that_merely_contain_the_word_vivo(self):
        assert is_wanted_release("Estoy vivo", "single")
        assert is_wanted_release("Vivo en Montevideo y no me quejo", "album")

    def test_does_not_reject_words_that_only_contain_the_marker(self):
        assert is_wanted_release("Alivio", "album")
        assert is_wanted_release("Remixeros de la vida", "album")
        assert is_wanted_release("Alive", "album")


class TestBaseTitle:
    def test_strips_edition_suffixes(self):
        assert base_title("Eco (Deluxe Edition)") == base_title("Eco")
        assert base_title("Eco - Remastered 2010") == base_title("Eco")
        assert base_title("Eco [Remasterizado]") == base_title("Eco")

    def test_keeps_other_parentheses(self):
        assert base_title("A las nueve (con Pichi)") != base_title("A las nueve")
