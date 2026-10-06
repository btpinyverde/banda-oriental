"""What visitors send from the archive (a mistake, a band that wants to be added, a message). Public, write-only, with the human
check, a limit per visitor and a field only bots fill."""

import re

from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.human import HasHumanPass

from .models import Album, Artist, Song, Submission

MAX_MESSAGE, MAX_NAME, MAX_CONTACT, MAX_LINKS, MAX_LABEL = 2000, 120, 200, 500, 200
MODELS = {"artist": (Artist, "name"), "album": (Album, "name"), "song": (Song, "title")}
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _text(data, field, maximum, *, required=False):
    value = data.get(field, "")
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError({field: "Tiene que ser un texto."})
    value = _CONTROL.sub("", value).strip()
    if len(value) > maximum:
        raise ValidationError({field: f"Es demasiado largo (máximo {maximum} caracteres)."})
    if required and not value:
        raise ValidationError({field: "Falta completar esto."})
    return value


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

        label = _text(data, "target_label", MAX_LABEL)
        if target_type and target_id:
            model, field = MODELS[target_type]
            name = model.objects.filter(pk=target_id).values_list(field, flat=True).first()
            label = (name or label)[:MAX_LABEL]
        elif not target_type:
            target_id, label = None, ""

        message = _text(data, "message", MAX_MESSAGE, required=kind in ("error", "contacto"))
        name = _text(data, "name", MAX_NAME, required=kind == "alta")
        contact = _text(data, "contact", MAX_CONTACT, required=kind == "alta")
        links = _text(data, "links", MAX_LINKS)

        Submission.objects.create(
            kind=kind, target_type=target_type, target_id=target_id, target_label=label, name=name, contact=contact, links=links, message=message
        )
        return Response({"ok": True}, status=201)
