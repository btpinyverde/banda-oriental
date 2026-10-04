import logging
import threading

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _deliver(email: str, subject: str, body: str) -> None:
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [email])
    except Exception:
        # A provider failure must not turn into a 500 (it would leave half-created state and reveal which addresses
        # have an account). Logged without the address, the body or the link.
        logger.exception("No se pudo enviar el correo %r", subject)


def _send(email: str, subject: str, body: str) -> None:
    if getattr(settings, "EMAIL_SEND_IN_BACKGROUND", False):
        # Only some branches send (known, confirmed, within limits...). Sending in the request would make those
        # answer slower than the rest and give away which addresses have an account.
        threading.Thread(target=_deliver, args=(email, subject, body), daemon=True).start()
    else:
        _deliver(email, subject, body)


def send_confirmation(email: str, raw_token: str) -> None:
    link = f"{settings.FRONTEND_URL}/cuenta/entrar#token={raw_token}&tipo=confirmar"
    _send(
        email,
        "Confirmá tu correo en Banda Oriental",
        "¡Hola!\n\n"
        "Alguien pidió crear una cuenta en Banda Oriental con este correo y una contraseña. "
        "Si fuiste vos, confirmá tu correo con este enlace (sirve una sola vez y vence en 24 horas):\n\n"
        f"{link}\n\n"
        "Si no fuiste vos, no abras el enlace: ignorá este mensaje y no pasa nada. "
        "Quien lo pidió eligió la contraseña, así que no confirmes una cuenta que no creaste.\n",
    )


def send_already_registered(email: str) -> None:
    _send(
        email,
        "Ya tenés una cuenta en Banda Oriental",
        "¡Hola!\n\n"
        "Alguien intentó crear una cuenta con este correo, pero ya tenés una. "
        f"Podés entrar desde {settings.FRONTEND_URL}/login.\n\n"
        "Si no fuiste vos, ignorá este mensaje y no pasa nada.\n",
    )


def send_magic_link(email: str, raw_token: str) -> None:
    link = f"{settings.FRONTEND_URL}/cuenta/entrar#token={raw_token}&tipo=acceso"
    _send(
        email,
        "Tu enlace para entrar a Banda Oriental",
        "¡Hola!\n\n"
        "Entrá a tu cuenta con este enlace (sirve una sola vez y vence en 15 minutos):\n\n"
        f"{link}\n\n"
        "Si no lo pediste vos, ignorá este mensaje y no pasa nada.\n",
    )


def send_password_reset(email: str, raw_token: str) -> None:
    link = f"{settings.FRONTEND_URL}/cuenta/entrar#token={raw_token}&tipo=restablecer"
    _send(
        email,
        "Elegí una contraseña nueva en Banda Oriental",
        "¡Hola!\n\n"
        "Para elegir una contraseña nueva, usá este enlace (sirve una sola vez y vence en 15 minutos):\n\n"
        f"{link}\n\n"
        "Al cambiarla se cierran las demás sesiones. Si no lo pediste vos, ignorá este mensaje.\n",
    )
