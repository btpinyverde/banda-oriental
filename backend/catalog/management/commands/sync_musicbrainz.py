from django.core.management.base import BaseCommand
from django.db import transaction

from catalog.coverartarchive import get_cover_art_url
from catalog.models import Album, Artist, Song, SyncState
from catalog.musicbrainz import (
    get_album_release_groups,
    get_release_for_release_group,
    get_tracklist,
    search_uruguayan_artists,
)


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

        artists, total_count = search_uruguayan_artists(
            offset=state.musicbrainz_offset, limit=limit
        )

        for artist_data in artists:
            self._sync_artist(artist_data)

        next_offset = state.musicbrainz_offset + len(artists)
        state.musicbrainz_offset = next_offset if next_offset < total_count else 0
        state.save()

        self.stdout.write(
            f"Synced {len(artists)} artist(s); next offset {state.musicbrainz_offset} of {total_count}."
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

            album, _ = Album.objects.update_or_create(
                mbid=album_data["mbid"],
                defaults={
                    "name": album_data["title"],
                    "artist": artist,
                    "year": album_data["year"],
                    "genre": album_data["genre"],
                    "cover_art_url": cover_art_url,
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
