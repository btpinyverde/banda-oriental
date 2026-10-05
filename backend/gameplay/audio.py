"""Turns an uploaded stem (usually a WAV straight out of Demucs) into the files the players really download.

A 30-second stereo WAV weighs about 5 MB; the same audio in AAC weighs a tenth or less. The game downloads four of
them to play one day, so the original is kept (private, to be able to convert again with other settings) and two AAC
versions are served: a good one and a light one for slow connections or data saving.
"""

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)

# name -> AAC bitrate. "high" is what `url` points at; "low" is for slow connections and data saving.
VARIANT_BITRATES = {"high": "128k", "low": "64k"}
# Generous: it runs in the background, and the free server is slow (several minutes for a full-length song is possible).
ENCODING_TIMEOUT_SECONDS = 900


class AudioError(Exception):
    """The audio could not be converted (not audio, or no ffmpeg to do it)."""


def ffmpeg_executable() -> str:
    """The `FFMPEG_BINARY` setting if there is one, else the ffmpeg of the system, else the one bundled with the
    imageio-ffmpeg package (which is what makes it work on a server where nobody installed ffmpeg)."""
    configured = getattr(settings, "FFMPEG_BINARY", "")
    if configured:
        return configured
    system = shutil.which("ffmpeg")
    if system:
        return system
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as error:  # the package missing, or no binary for this platform
        raise AudioError("No hay ffmpeg para convertir el audio.") from error


def encode_variants(data: bytes) -> dict[str, bytes]:
    """Converts audio of any format ffmpeg reads into one M4A (AAC) per variant, without the original's tags: the
    files reach the players, and a title or artist tag would give away the answer."""
    executable = ffmpeg_executable()
    if not (os.path.isabs(executable) and os.path.exists(executable)) and not shutil.which(executable):
        raise AudioError(f"No se encontró ffmpeg ({executable}).")
    results = {}
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / "source"
        source.write_bytes(data)
        # One pass: the input is decoded once and both versions are written (half the work of two runs).
        command = [executable, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)]
        targets = {}
        for name, bitrate in VARIANT_BITRATES.items():
            targets[name] = Path(folder) / f"{name}.m4a"
            command += [
                "-map", "0:a:0", "-vn", "-map_metadata", "-1",
                "-c:a", "aac", "-b:a", bitrate, "-ar", "44100", "-movflags", "+faststart",
                str(targets[name]),
            ]  # fmt: skip
        try:
            subprocess.run(command, check=True, capture_output=True, timeout=ENCODING_TIMEOUT_SECONDS)
        except subprocess.CalledProcessError as error:
            raise AudioError(error.stderr.decode(errors="replace").strip() or "ffmpeg falló.") from error
        except subprocess.TimeoutExpired as error:
            raise AudioError("ffmpeg tardó demasiado.") from error
        for name, target in targets.items():
            results[name] = target.read_bytes()
    return results
