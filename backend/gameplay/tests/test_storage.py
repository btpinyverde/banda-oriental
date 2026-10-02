from django.conf import settings


def test_stems_storage_points_at_r2_not_local_disk():
    stems_config = settings.STORAGES["stems"]
    assert stems_config["BACKEND"] == "storages.backends.s3.S3Storage"
    assert stems_config["OPTIONS"]["bucket_name"] == settings.R2_BUCKET_NAME
    assert stems_config["OPTIONS"]["endpoint_url"] == settings.R2_ENDPOINT_URL
    # Private bucket (confirmed when it was created in Cloudflare's
    # dashboard) — every URL must be signed, never a bare public link.
    assert stems_config["OPTIONS"]["querystring_auth"] is True
