from django.conf import settings
from storages.backends.s3 import S3Storage


def test_stems_storage_points_at_r2_not_local_disk():
    stems_config = settings.STORAGES["stems"]
    assert stems_config["BACKEND"] == "storages.backends.s3.S3Storage"
    assert stems_config["OPTIONS"]["bucket_name"] == settings.R2_BUCKET_NAME
    assert stems_config["OPTIONS"]["endpoint_url"] == settings.R2_ENDPOINT_URL
    # Private bucket (confirmed when it was created in Cloudflare's
    # dashboard) — every URL must be signed, never a bare public link.
    assert stems_config["OPTIONS"]["querystring_auth"] is True


def test_stems_storage_does_not_silently_overwrite_existing_objects():
    # Demucs gives every song's stems the same filenames (drums.wav,
    # bass.wav, ...) — without this, re-uploading a day (or a filename
    # collision between two stems) would silently replace another day's
    # audio instead of erroring.
    assert settings.STORAGES["stems"]["OPTIONS"]["file_overwrite"] is False


def test_stems_storage_urls_are_actually_signed_not_just_configured_to_be():
    # test_stems_storage_points_at_r2_not_local_disk only re-reads the
    # settings dict — it never proves a URL that storage produces is
    # actually signed. Build a real S3Storage with the same OPTIONS
    # (fake credentials, no network needed for URL generation) and check
    # the URL it would hand to a player.
    options = {
        **settings.STORAGES["stems"]["OPTIONS"],
        "access_key": "fake-access-key",
        "secret_key": "fake-secret-key",
        "bucket_name": "fake-bucket",
        "endpoint_url": "https://fake-account.r2.cloudflarestorage.com",
    }
    storage = S3Storage(**options)
    url = storage.url("stems/2026-10-02/somekey.mp3")
    assert "X-Amz-Signature" in url
