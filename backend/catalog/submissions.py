"""What visitors send from the archive (a mistake, a band that wants to be added, a message). Public, write-only, with the human
check, a limit per visitor and a field only bots fill."""

import io
import logging
import re

from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.human import HasHumanPass

from .models import Album, Artist, Song, Submission, SubmissionImage
from .notifications import notify_new_submission

logger = logging.getLogger(__name__)

MAX_MESSAGE, MAX_NAME, MAX_CONTACT, MAX_LINKS, MAX_LABEL, MAX_REASON = 2000, 120, 200, 500, 200, 60
MODELS = {"artist": (Artist, "name"), "album": (Album, "name"), "song": (Song, "title")}
MAX_IMAGES, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE = 3, 5 * 1024 * 1024, 40_000_000, 1600
ACCEPTED_FORMATS = {"PNG", "JPEG", "WEBP"}
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _text(data, field, maximum, *, required=False, one_line=False):
    value = data.get(field, "")
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError({field: "Tiene que ser un texto."})
    value = _CONTROL.sub("", value)
    value = " ".join(value.split()) if one_line else value.strip()
    if len(value) > maximum:
        raise ValidationError({field: f"Es demasiado largo (máximo {maximum} caracteres)."})
    if required and not value:
        raise ValidationError({field: "Falta completar esto."})
    return value


def _clean_image(uploaded):
    """What was really uploaded decides, not its name or the type the browser says: only PNG, JPEG and WEBP; never more than 40
    megapixels (checked before decoding); re-encoded to WEBP and shrunk, which also drops any metadata or hidden data in the file."""
    if uploaded.size > MAX_IMAGE_BYTES:
        raise ValidationError({"images": "Cada imagen puede pesar hasta 5 MB."})
    try:
        image = Image.open(uploaded)
        if image.format not in ACCEPTED_FORMATS:
            raise ValidationError({"images": "Las imágenes tienen que ser PNG, JPG o WEBP."})
        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise ValidationError({"images": "Una de las imágenes es demasiado grande."})
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
        out = io.BytesIO()
        image.save(out, "WEBP", quality=85)
    except ValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise ValidationError({"images": "Uno de los archivos no es una imagen válida."}) from None
    return out.getvalue()


class SubmissionCreateView(APIView):
    throttle_scope = "reports"
    permission_classes = [HasHumanPass]
    http_method_names = ["post", "options"]

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        if data.get("website"):  # the hidden field a person never sees: only a bot fills it. It is told all went well.
            return Response({"ok": True}, status=201)
        kind = data.get("kind")
        if kind not in dict(Submission.KINDS):
            raise ValidationError({"kind": "Tipo de mensaje inválido."})

        target_type = data.get("target_type") or ""
        target_id = data.get("target_id")
        if target_type and target_type not in MODELS:
            raise ValidationError({"target_type": "Tipo inválido."})
        if target_id in (None, ""):
            target_id = None
        elif isinstance(target_id, bool) or not str(target_id).isdigit() or not 0 < int(target_id) < 2**31:
            raise ValidationError({"target_id": "Número inválido."})
        else:
            target_id = int(target_id)

        label = _text(data, "target_label", MAX_LABEL, one_line=True)
        if target_type and target_id:
            model, field = MODELS[target_type]
            name = model.objects.filter(pk=target_id).values_list(field, flat=True).first()
            label = (name or label)[:MAX_LABEL]
        elif not target_type:
            target_id, label = None, ""

        uploads = request.FILES.getlist("images") if hasattr(request, "FILES") else []
        if len(uploads) > MAX_IMAGES:
            raise ValidationError({"images": f"Podés adjuntar hasta {MAX_IMAGES} imágenes."})
        pictures = [_clean_image(upload) for upload in uploads]  # before storing anything: a bad file means nothing is saved

        message = _text(data, "message", MAX_MESSAGE, required=kind in ("error", "contacto"))
        name = _text(data, "name", MAX_NAME, required=kind == "alta", one_line=True)
        contact = _text(data, "contact", MAX_CONTACT, required=kind == "alta", one_line=True)
        links = _text(data, "links", MAX_LINKS, one_line=True)
        reason = _text(data, "reason", MAX_REASON, one_line=True)

        item = Submission.objects.create(
            kind=kind, target_type=target_type, target_id=target_id, target_label=label, name=name, contact=contact, links=links, reason=reason, message=message
        )
        SubmissionImage.objects.bulk_create([SubmissionImage(submission=item, data=data) for data in pictures])
        try:
            notify_new_submission(item)  # the message is already stored: whatever happens here must not turn into an error
        except Exception:
            logger.exception("Falló el aviso por correo del mensaje %s", item.pk)
        return Response({"ok": True}, status=201)
