from django.conf import settings
from django.core.mail import send_mail


def _send(email: str, subject: str, body: str) -> None:
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [email])


def send_confirmation(email: str, raw_token: str) -> None:
    link = f"{settings.FRONTEND_URL}/cuenta/entrar#token={raw_token}&tipo=confirmar"
    _send(
        email,
        "Confirmá tu correo en Banda Oriental",
        "¡Hola!\n\n"
        "Para terminar de crear tu cuenta, confirmá tu correo con este enlace (sirve una sola vez y vence en 24 horas):\n\n"
        f"{link}\n\n"
        "Si no fuiste vos, ignorá este mensaje y no pasa nada.\n",
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
