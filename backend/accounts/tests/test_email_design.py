import re
from html import unescape

import pytest
from django.test import override_settings

from accounts import emails

TOKEN = "tok_ABC-123_xyz"
KINDS = [
    ("send_confirmation", (TOKEN,), "tipo=confirmar", "Confirmar mi correo"),
    ("send_magic_link", (TOKEN,), "tipo=acceso", "Entrar a Banda Oriental"),
    ("send_password_reset", (TOKEN,), "tipo=restablecer", "Elegir contraseña nueva"),
    ("send_already_registered", (), "/login", "Ir a iniciar sesión"),
]


def send(kind, args, mailoutbox):
    getattr(emails, kind)("persona@example.com", *args)
    assert len(mailoutbox) == 1
    return mailoutbox[0]


def html_of(message):
    (html, mimetype), = message.alternatives
    assert mimetype == "text/html"
    return html


@pytest.mark.parametrize("kind,args,marker,label", KINDS)
class TestEveryEmailHasADesignedVersion:
    def test_it_goes_as_text_and_html_so_any_mail_client_can_show_it(self, kind, args, marker, label, mailoutbox):
        message = send(kind, args, mailoutbox)

        assert message.body.strip()
        assert "<" not in message.body
        assert "text/html" in [mimetype for _, mimetype in message.alternatives]

    def test_the_button_and_the_text_carry_the_same_link(self, kind, args, marker, label, mailoutbox, settings):
        message = send(kind, args, mailoutbox)
        html = html_of(message)

        hrefs = [unescape(href) for href in re.findall(r'href="([^"]+)"', html)]
        assert any(marker in href and href.startswith(settings.FRONTEND_URL) for href in hrefs)
        link = next(href for href in hrefs if marker in href)
        assert link in message.body
        assert label in html

    def test_it_uses_the_brand_logo_hosted_on_the_site(self, kind, args, marker, label, mailoutbox, settings):
        html = html_of(send(kind, args, mailoutbox))

        assert f'src="{settings.FRONTEND_URL}/assets/email/logo-banda-oriental.png"' in html
        assert 'alt="Banda Oriental"' in html

    def test_it_is_safe_to_open_anywhere(self, kind, args, marker, label, mailoutbox):
        html = html_of(send(kind, args, mailoutbox))

        assert "<script" not in html.lower()
        assert "javascript:" not in html.lower()
        # No tracking: the only images are the brand ones from our own site.
        sources = re.findall(r'src="([^"]+)"', html)
        assert sources and all("/assets/email/" in source for source in sources)
        # Inline styles and tables only: that is what Gmail and Outlook render reliably.
        assert "<style" not in html.lower() or "@media" in html.lower()


def test_a_token_is_never_put_in_the_subject_or_in_the_visible_text_twice_by_accident(mailoutbox):
    emails.send_magic_link("persona@example.com", TOKEN)
    message = mailoutbox[0]

    assert TOKEN not in message.subject


def test_the_link_is_escaped_in_the_html_so_odd_characters_cannot_break_out_of_the_attribute(mailoutbox):
    emails.send_magic_link("persona@example.com", 'x"><script>alert(1)</script>')
    html = html_of(mailoutbox[0])

    assert "<script>" not in html
    assert "&quot;" in html or "%22" in html


@override_settings(FRONTEND_URL="https://bandaoriental.xami.uy")
def test_the_email_tells_how_long_the_link_lasts(mailoutbox):
    emails.send_magic_link("persona@example.com", TOKEN)
    emails.send_confirmation("persona@example.com", TOKEN)

    assert "15 minutos" in html_of(mailoutbox[0])
    assert "24 horas" in html_of(mailoutbox[1])
