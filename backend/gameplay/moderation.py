BANNED_WORDS = {"bannedword1"}


def contains_banned_word(text):
    lowered = text.lower()
    return any(word in lowered for word in BANNED_WORDS)
