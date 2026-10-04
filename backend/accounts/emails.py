import logging
import threading

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from .email_layout import render

logger = logging.getLogger(__name__)


def _deliver(email: str, subject: str, body: str, html: str) -> None:
    try:
        message = EmailMultiAlternatives(subject, body, settings.DEFAULT_FROM_EMAIL, [email])
        message.extra_headers["Content-Language"] = "es"
        message.attach_alternative(html, "text/html")
        message.send()
    except Exception:
        # A provider failure must not turn into a 500 (it would leave half-created state and reveal which addresses
        # have an account). Logged without the address, the body or the link.
        logger.exception("No se pudo enviar el correo %r", subject)


def _send(email: str, subject: str, body: str, html: str) -> None:
    if getattr(settings, "EMAIL_SEND_IN_BACKGROUND", False):
        # Only some branches send (known, confirmed, within limits...). Sending in the request would make those
        # answer slower than the rest and give away which addresses have an account.
        threading.Thread(target=_deliver, args=(email, subject, body, html), daemon=True).start()
    else:
        _deliver(email, subject, body, html)


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
        render(
            hero="confirmar",
            preheader="Un último paso para crear tu cuenta.",
            label="Confirmá tu correo",
            heading="¡Ya casi estás!",
            paragraphs=[
                "¡Hola! Alguien pidió crear una cuenta en Banda Oriental con este correo. "
                "Si fuiste vos, confirmalo con el botón y tu historial queda guardado: tus rachas, tus aciertos "
                "y todas las canciones que adivinaste, en cualquier dispositivo."
            ],
            button="Confirmar mi correo",
            link=link,
            note="El enlace sirve una sola vez y vence en 24 horas. Si no fuiste vos, no lo abras: "
            "quien lo pidió eligió la contraseña, así que no confirmes una cuenta que no creaste.",
        ),
    )


def send_already_registered(email: str) -> None:
    link = f"{settings.FRONTEND_URL}/login"
    _send(
        email,
        "Ya tenés una cuenta en Banda Oriental",
        "¡Hola!\n\n"
        "Alguien intentó crear una cuenta con este correo, pero ya tenés una. "
        f"Podés entrar desde {link}.\n\n"
        "Si no fuiste vos, ignorá este mensaje y no pasa nada.\n",
        render(
            hero="cuenta",
            preheader="Ya tenés una cuenta: entrá desde acá.",
            label="Tu cuenta",
            heading="¡Ya sos parte de Banda Oriental!",
            paragraphs=[
                "¡Hola! Alguien intentó crear una cuenta con este correo, pero ya tenés una. "
                "Entrá con tu contraseña o pedí un enlace por correo, y seguí con tu racha."
            ],
            button="Ir a iniciar sesión",
            link=link,
            note="Si no fuiste vos, ignorá este mensaje: tu cuenta sigue igual y no pasa nada.",
        ),
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
        render(
            hero="acceso",
            preheader="Tu enlace para entrar, válido por 15 minutos.",
            label="Tu enlace de acceso",
            heading="¡Entrá y a jugar!",
            paragraphs=[
                "¡Hola! Tocá el botón y entrás directo a tu cuenta, sin contraseña. "
                "Tu historial y tu racha te están esperando."
            ],
            button="Entrar a Banda Oriental",
            link=link,
            note="El enlace sirve una sola vez y vence en 15 minutos. Si no lo pediste vos, ignorá este mensaje.",
        ),
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
        render(
            hero="restablecer",
            preheader="Elegí una contraseña nueva, válido por 15 minutos.",
            label="Recuperar contraseña",
            heading="Elegí tu contraseña nueva",
            paragraphs=[
                "¡Hola! Pediste cambiar tu contraseña. Tocá el botón y elegí una nueva. "
                "Al cambiarla, se cierran tus sesiones en los demás dispositivos."
            ],
            button="Elegir contraseña nueva",
            link=link,
            note="El enlace sirve una sola vez y vence en 15 minutos. Si no lo pediste vos, ignorá este mensaje.",
        ),
    )
