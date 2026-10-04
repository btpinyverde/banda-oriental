"""HTML for the transactional emails, in the look of the game.

Mail clients ignore most modern CSS, so this is the old-fashioned way: tables, inline styles, system fonts and
PNG images hosted on the site (Gmail does not show SVG). No scripts, no tracking pixels, and every dynamic value is
escaped. Each email also goes out as plain text, which the clients that don't show HTML use.
"""

from html import escape

from django.conf import settings

CREAM = "#fbf8f1"
INK = "#14110f"
INK_SOFT = "#4a4540"
VIOLET = "#6c4ff0"
VIOLET_LIGHT = "#efedfc"
YELLOW = "#fff0a6"
FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"


def _asset(name: str) -> str:
    return f"{settings.FRONTEND_URL}/assets/email/{name}"


def render(
    *, hero: str, preheader: str, label: str, heading: str, paragraphs: list[str], button: str, link: str, note: str
) -> str:
    """One email: an illustrated header, a small label, a heading, a few paragraphs, a big button, a note on the
    link, and the footer. `hero` names the illustration (cabecera-<hero>.png)."""
    href = escape(link, quote=True)
    body = "".join(
        f'<p style="margin:0 0 16px 0;font-family:{FONT};font-size:16px;line-height:1.6;color:{INK_SOFT};">'
        f"{escape(text)}</p>"
        for text in paragraphs
    )
    return f"""<!DOCTYPE html>
<html lang="es" xml:lang="es" translate="no" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Language" content="es">
<meta name="google" content="notranslate">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>{escape(heading)}</title>
</head>
<body lang="es" style="margin:0;padding:0;background-color:{CREAM};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{CREAM};">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{CREAM}" style="background-color:{CREAM};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
    <tr><td align="center" style="padding:0 0 24px 0;">
      <img src="{_asset("logo-banda-oriental.png")}" width="150" alt="Banda Oriental" style="display:block;border:0;outline:none;height:auto;width:150px;">
    </td></tr>
    <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:28px;padding:40px 36px;border:2px solid {INK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:0 0 24px 0;">
          <img src="{_asset(f"cabecera-{hero}.png")}" width="488" alt="Dos personajes de Banda Oriental sonriendo, entre notas musicales y confeti" style="display:block;width:100%;max-width:488px;height:auto;border:0;border-radius:20px;">
        </td></tr>
        <tr><td style="padding:0 0 18px 0;">
          <span style="display:inline-block;background-color:{VIOLET_LIGHT};color:{VIOLET};font-family:{FONT};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:6px 14px;border-radius:999px;">{escape(label)}</span>
        </td></tr>
        <tr><td style="padding:0 0 18px 0;">
          <h1 style="margin:0;font-family:{FONT};font-size:30px;line-height:1.15;font-weight:800;color:{INK};">{escape(heading)}</h1>
        </td></tr>
        <tr><td>{body}</td></tr>
        <tr><td style="padding:10px 0 26px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="{VIOLET}" style="background-color:{VIOLET};border-radius:999px;">
              <a href="{href}" target="_blank" style="display:inline-block;padding:16px 34px;font-family:{FONT};font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">{escape(button)}</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td bgcolor="{YELLOW}" style="background-color:{YELLOW};border-radius:16px;padding:14px 18px;">
          <p style="margin:0;font-family:{FONT};font-size:14px;line-height:1.5;color:{INK};">{escape(note)}</p>
        </td></tr>
        <tr><td style="padding:26px 0 0 0;">
          <p style="margin:0;font-family:{FONT};font-size:14px;line-height:1.6;color:{INK_SOFT};">¿El botón no funciona? <a href="{href}" target="_blank" style="color:{VIOLET};font-weight:700;text-decoration:underline;">Abrí este enlace</a> en tu navegador.</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:28px 16px 0 16px;">
      <img src="{_asset("asterisco.png")}" width="28" alt="" style="display:block;border:0;margin:0 auto 10px auto;">
      <p style="margin:0 0 6px 0;font-family:{FONT};font-size:13px;line-height:1.5;color:{INK_SOFT};"><strong>Banda Oriental</strong> · Una canción uruguaya nueva cada día</p>
      <p style="margin:0;font-family:{FONT};font-size:12px;line-height:1.5;color:{INK_SOFT};">Si no pediste este mensaje, ignoralo: no pasa nada.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
"""
