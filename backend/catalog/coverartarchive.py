import requests

BASE_URL = "https://coverartarchive.org"


def get_cover_art_url(release_mbid):
    try:
        response = requests.get(f"{BASE_URL}/release/{release_mbid}", timeout=10)
        response.raise_for_status()
    except requests.RequestException:
        # Covers 404 (no art) and real-world failures like archive.org
        # (where Cover Art Archive redirects) timing out or being
        # unreachable — none of these should crash the whole sync.
        return ""
    data = response.json()
    for image in data.get("images", []):
        if image.get("front"):
            thumbnails = image.get("thumbnails", {})
            return thumbnails.get("500") or image.get("image", "")
    return ""
