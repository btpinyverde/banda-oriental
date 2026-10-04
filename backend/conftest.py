import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache_between_tests():
    """The rate limits, the login-failure counters and the cached song list live in the cache: nothing may leak
    from one test into the next."""
    cache.clear()
    yield
    cache.clear()
