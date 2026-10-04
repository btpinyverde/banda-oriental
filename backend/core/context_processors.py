from django.conf import settings


def brand(request):
    """What the pages we brand (admin, API root, 404) need to link back to the game."""
    return {"FRONTEND_URL": settings.FRONTEND_URL}
