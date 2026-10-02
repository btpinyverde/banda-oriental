import requests

BASE_URL = "https://coverartarchive.org"


def get_cover_art_url(release_mbid):
    try:
        response = requests.get(f"{BASE_URL}/release/{release_mbid}", timeout=10)
        response.raise_for_status()
    except requests.HTTPError:
        return ""
    data = response.json()
    for image in data.get("images", []):
        if image.get("front"):
            thumbnails = image.get("thumbnails", {})
            return thumbnails.get("500") or image.get("image", "")
    return ""
