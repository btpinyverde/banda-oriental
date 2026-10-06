"""The owner's email when someone writes from the site. Never gets in the way of storing the message: no address, the daily cap or a
provider failure only mean that no email goes out (and `notified_at` stays empty, so the admin shows it was not sent)."""

import logging
import threading
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMessage
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.utils import timezone

from .models import Submission

logger = logging.getLogger(__name__)

NOTIFIED_KINDS = ("contacto", "alta")  # the ones a person is waiting an answer to; mistakes in the archive wait in the admin


def _one_line(text, limit=120):
    return " ".join(str(text).split())[:limit]


def _valid_email(text):
    try:
        validate_email(text)
    except ValidationError:
        return None
    return text


def _subject(item):
    if item.kind == "alta":
        return _one_line(f"Sumar artista: {item.name}")
    return _one_line(f"Contacto: {item.reason or 'sin motivo'} ({item.name or 'sin nombre'})")


def _body(item):
    lines = [f"Nombre: {item.name or '-'}", f"Contacto: {item.contact or '-'}"]
    if item.kind == "contacto":
        lines.append(f"Motivo: {item.reason or '-'}")
    if item.links:
        lines.append(f"Enlaces: {item.links}")
    lines += ["", item.message or "(sin mensaje)", "", "Está también en el admin, en Reportes y pedidos."]
    return "\n".join(lines)


def _deliver(item_id, message):
    try:
        message.send()
    except Exception:
        logger.exception("No se pudo enviar el aviso del mensaje %s", item_id)
        return
    Submission.objects.filter(pk=item_id).update(notified_at=timezone.now())


def notify_new_submission(item):
    """Emails the owner about `item` if it is one of the kinds a person waits an answer to, an address is set and the daily cap allows it."""
    recipient = getattr(settings, "CONTACT_NOTIFY_EMAIL", "")
    if item.kind not in NOTIFIED_KINDS or not recipient:
        return
    sent_today = Submission.objects.filter(notified_at__gte=timezone.now() - timedelta(hours=24)).count()
    if sent_today >= settings.CONTACT_NOTIFY_DAILY_CAP:
        logger.warning("Se alcanzó el límite diario de avisos por correo (%s).", settings.CONTACT_NOTIFY_DAILY_CAP)
        return
    reply_to = _valid_email(item.contact)  # answering goes straight to the visitor, when they left an email
    message = EmailMessage(_subject(item), _body(item), settings.DEFAULT_FROM_EMAIL, [recipient], reply_to=[reply_to] if reply_to else None)
    if getattr(settings, "EMAIL_SEND_IN_BACKGROUND", False):
        threading.Thread(target=_deliver, args=(item.pk, message), daemon=True).start()
    else:
        _deliver(item.pk, message)
