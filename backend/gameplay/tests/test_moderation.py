from gameplay.moderation import contains_banned_word


def test_clean_name_is_allowed():
    assert contains_banned_word("Brandon") is False


def test_banned_word_is_caught_case_insensitively():
    assert contains_banned_word("ESTOYbannedWORD1aqui") is True


def test_banned_word_as_a_substring_is_caught():
    assert contains_banned_word("xbannedword1x") is True


def test_empty_string_is_allowed():
    assert contains_banned_word("") is False
