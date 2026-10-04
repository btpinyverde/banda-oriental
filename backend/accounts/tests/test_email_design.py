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


HEROES = {
    "send_confirmation": "confirmar",
    "send_magic_link": "acceso",
    "send_password_reset": "restablecer",
    "send_already_registered": "cuenta",
}


@pytest.mark.parametrize("kind,args,marker,label", KINDS)
class TestSpanishAndIllustration:
    def test_every_way_of_saying_the_language_is_spanish_so_gmail_does_not_offer_to_translate(
        self, kind, args, marker, label, mailoutbox
    ):
        message = send(kind, args, mailoutbox)
        html = html_of(message)

        assert message.extra_headers.get("Content-Language") == "es"
        assert '<html lang="es"' in html and 'xml:lang="es"' in html
        assert '<meta http-equiv="Content-Language" content="es">' in html

    def test_each_email_opens_with_its_own_illustrated_header(self, kind, args, marker, label, mailoutbox, settings):
        html = html_of(send(kind, args, mailoutbox))

        header = f'src="{settings.FRONTEND_URL}/assets/email/cabecera-{HEROES[kind]}.png"'
        assert header in html
        assert re.search(r'<img[^>]+cabecera-[a-z]+\.png"[^>]+alt="[^"]+"', html)


@pytest.mark.parametrize("kind,args,marker,label", KINDS)
class TestGmailDoesNotMisreadTheLanguage:
    def test_the_raw_link_is_not_printed_as_visible_text_because_a_long_random_token_reads_as_english(
        self, kind, args, marker, label, mailoutbox
    ):
        html = html_of(send(kind, args, mailoutbox))
        visible = re.sub(r"<[^>]+>", " ", html)  # tags (and so the hrefs) removed

        assert "http" not in visible
        assert TOKEN not in visible

    def test_the_email_asks_not_to_be_offered_for_translation(self, kind, args, marker, label, mailoutbox):
        html = html_of(send(kind, args, mailoutbox))

        assert '<meta name="google" content="notranslate">' in html
        assert 'translate="no"' in html

    def test_the_plain_text_version_still_has_the_full_link_to_copy(self, kind, args, marker, label, mailoutbox):
        message = send(kind, args, mailoutbox)

        assert "http" in message.body


class TestReplyTo:
    """The sender address cannot receive mail (its domain points at the website), so replies need somewhere real to go:
    a mailbox the owner reads. Outlook also weighs a sender that cannot be answered against the message."""

    def test_when_a_reply_address_is_set_every_account_email_carries_it(self, mailoutbox, settings):
        settings.REPLY_TO_EMAIL = "hola@xami.uy"

        emails.send_magic_link("persona@example.com", TOKEN)
        emails.send_confirmation("persona@example.com", TOKEN)
        emails.send_password_reset("persona@example.com", TOKEN)
        emails.send_already_registered("persona@example.com")

        assert len(mailoutbox) == 4
        assert all(message.reply_to == ["hola@xami.uy"] for message in mailoutbox)

    def test_without_one_nothing_changes(self, mailoutbox, settings):
        settings.REPLY_TO_EMAIL = ""

        emails.send_magic_link("persona@example.com", TOKEN)

        assert mailoutbox[0].reply_to == []

    def test_it_is_off_by_default(self, settings):
        from config.settings import base

        assert base.REPLY_TO_EMAIL == ""
