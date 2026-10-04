from django.db.models import Q


def is_signed_in(request) -> bool:
    return request.user is not None and request.user.is_authenticated


def owner_filter(request, device_id: str) -> Q:
    """Whose games these are: the account's when there is a session, the device's otherwise.

    With a session the account's games follow it across devices (and an account plays once a day whatever device
    it uses). Without one it's the device's games that nobody owns, as before: someone without an account must not
    see (or be blocked by) the games an account played on a shared device.
    """
    return Q(user=request.user) if is_signed_in(request) else Q(device_id=device_id, user__isnull=True)


def owner_fields(request) -> dict:
    return {"user": request.user if is_signed_in(request) else None}
