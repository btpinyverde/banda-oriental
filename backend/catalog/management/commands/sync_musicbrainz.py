import time

from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.coverartarchive import get_cover_art_url
from catalog.models import Album, Artist, Song, SyncState
from catalog.musicbrainz import (
    get_album_release_groups,
    get_release_for_release_group,
    get_tracklist,
    browse_uruguayan_artists,
)

# Each artist can take several seconds (MusicBrainz calls are rate-limited
# to 1/s, plus a Cover Art Archive call per album). Render's gunicorn
# worker has a 30s default timeout, and this runs inside an admin request
# with no background worker to hand it off to — so this must stop well
# before that, saving progress as it goes, rather than risk being killed
# mid-batch with nothing to show for it.
TIME_BUDGET_SECONDS = 20


class Command(BaseCommand):
    help = (
        "Sync a bounded batch of Uruguayan artists/albums/songs from "
        "MusicBrainz + Cover Art Archive, resuming from the last offset."
    )

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=5)

    def handle(self, *args, **options):
        limit = options["limit"]
        state = SyncState.get_solo()
        start_offset = state.musicbrainz_offset
        deadline = time.monotonic() + TIME_BUDGET_SECONDS

        artists, total_count = browse_uruguayan_artists(offset=start_offset, limit=limit)

        attempted = 0
        for artist_data in artists:
            if time.monotonic() > deadline:
                self.stdout.write(
                    f"Stopping early: time budget ({TIME_BUDGET_SECONDS}s) reached."
                )
                break

            try:
                self._sync_artist(artist_data)
            except Exception as exc:
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipping {artist_data['name']} ({artist_data['mbid']}): {exc}"
                    )
                )

            attempted += 1
            next_offset = start_offset + attempted
            state.musicbrainz_offset = next_offset if next_offset < total_count else 0
            state.save()

        self.stdout.write(
            f"Synced {attempted} artist(s); next offset {state.musicbrainz_offset} of {total_count}."
        )

    @transaction.atomic
    def _sync_artist(self, artist_data):
        artist, _ = Artist.objects.update_or_create(
            mbid=artist_data["mbid"], defaults={"name": artist_data["name"]}
        )

        for album_data in get_album_release_groups(artist.mbid):
            release = get_release_for_release_group(album_data["mbid"])
            cover_art_url = ""
            if release and release["has_cover_art"]:
                cover_art_url = get_cover_art_url(release["mbid"])

            existing = Album.objects.filter(mbid=album_data["mbid"]).first()
            # Never let a transient gap in this sync's data (API didn't
            # return a genre/year this time, Cover Art Archive timed out)
            # overwrite a good value a previous sync — or the admin's own
            # manual edit — already saved.
            year = album_data["year"] if album_data["year"] is not None else (
                existing.year if existing else None
            )
            genre = album_data["genre"] or (existing.genre if existing else "")
            final_cover_art_url = cover_art_url or (
                existing.cover_art_url if existing else ""
            )

            album, _ = Album.objects.update_or_create(
                mbid=album_data["mbid"],
                defaults={
                    "name": album_data["title"],
                    "artist": artist,
                    "year": year,
                    "genre": genre,
                    "cover_art_url": final_cover_art_url,
                },
            )

            if release is None:
                continue

            for track in get_tracklist(release["mbid"]):
                Song.objects.update_or_create(
                    mbid=track["mbid"],
                    defaults={
                        "title": track["title"],
                        "album": album,
                        "duration_seconds": track["duration_seconds"],
                    },
                )
