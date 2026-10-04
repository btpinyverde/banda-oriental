import Link from "next/link";
import { Ondulada } from "./Ondulada";

const COLUMNAS = [
  {
    titulo: "Jugar",
    enlaces: [
      { href: "/jugar", etiqueta: "Modo diario" },
      { href: "/batalla", etiqueta: "Modo batalla" },
      { href: "/ranking", etiqueta: "Ranking" },
    ],
  },
  {
    titulo: "Explorar",
    enlaces: [
      { href: "/archivo", etiqueta: "Archivo de canciones" },
      { href: "/artistas", etiqueta: "Artistas" },
      { href: "/epocas", etiqueta: "Épocas" },
      { href: "/generos", etiqueta: "Géneros" },
    ],
  },
  {
    titulo: "Banda Oriental",
    enlaces: [
      { href: "/acerca", etiqueta: "Acerca de" },
      { href: "/como-funciona", etiqueta: "Cómo funciona" },
      { href: "/contacto", etiqueta: "Contacto" },
      { href: "/sugerencias", etiqueta: "Sugerencias" },
    ],
  },
];

/** Redes sociales. Íconos de Simple Icons (CC0). Las URLs son provisorias hasta tener los perfiles reales. */
const REDES = [
  { href: "#", etiqueta: "Instagram", icono: "social-instagram" },
  { href: "#", etiqueta: "TikTok", icono: "social-tiktok" },
  { href: "#", etiqueta: "Spotify", icono: "social-spotify" },
];

const LEGALES = [
  { href: "/terminos", etiqueta: "Términos" },
  { href: "/privacidad", etiqueta: "Privacidad" },
  { href: "/contacto", etiqueta: "Contacto" },
];

/**
 * Pie de página. `footer__arte` lleva a Flan.
 * La variante "compacto" es una sola fila (logo, lema, redes y enlaces legales) para páginas con mucho adorno,
 * como la 404.
 */
export function Footer({ variante = "completo" }: { variante?: "completo" | "compacto" }) {
  if (variante === "compacto") {
    return (
      <footer className="footer footer--compacto">
        <Ondulada className="footer--compacto__ondulada" />
        <div className="footer--compacto__fila">
          <Link href="/" className="footer__logo">
            <img src="/assets/brand-wordmark.svg" alt="Banda Oriental, inicio" width={84} height={45} />
          </Link>
          <p className="footer--compacto__lema">El juego de la música uruguaya.</p>
          <ul className="footer__redes">
            {REDES.map(({ href, etiqueta, icono }) => (
              <li key={etiqueta}>
                <a href={href} className="red" aria-label={etiqueta}>
                  <span className="red__icono" aria-hidden="true">
                    <img src={`/assets/${icono}.svg`} alt="" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <ul className="footer--compacto__legales">
            {LEGALES.map(({ href, etiqueta }) => (
              <li key={etiqueta}>
                <Link href={href}>{etiqueta}</Link>
              </li>
            ))}
          </ul>
          <img className="footer__estrella" src="/assets/brand-asterisk.svg" alt="" width={36} height={36} />
        </div>
      </footer>
    );
  }

  return (
    <footer className="footer">
      <img className="footer__deco footer__deco--rosa" src="/assets/footer-blob-pink.svg" alt="" aria-hidden="true" />
      <img className="footer__deco footer__deco--amarillo" src="/assets/footer-blob-yellow.svg" alt="" aria-hidden="true" />
      <img className="footer__deco footer__deco--rayas" src="/assets/footer-rays-logo.svg" alt="" aria-hidden="true" />

      <div className="footer__cuerpo">
        <Ondulada className="footer__ondulada" />

        <div className="footer__principal">
          <div className="footer__marca">
            <Link href="/" className="footer__logo">
              <img src="/assets/brand-wordmark.svg" alt="Banda Oriental, inicio" width={168} height={90} />
            </Link>
            <p className="footer__lema">El juego de la música uruguaya. Escuchá, pensá, probá y descubrí nuevas canciones.</p>
            <ul className="footer__redes">
              {REDES.map(({ href, etiqueta, icono }) => (
                <li key={etiqueta}>
                  <a href={href} className="red" aria-label={etiqueta}>
                    <span className="red__icono" aria-hidden="true">
                      <img src={`/assets/${icono}.svg`} alt="" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {COLUMNAS.map(({ titulo, enlaces }) => (
            <nav key={titulo} className="footer__columna" aria-label={titulo}>
              <h2 className="footer__titulo">{titulo}</h2>
              <ul>
                {enlaces.map(({ href, etiqueta }) => (
                  <li key={etiqueta}>
                    <Link href={href}>{etiqueta}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="footer__arte" aria-hidden="true">
            <img src="/assets/flan_footer.webp" alt="" width={760} height={695} />
          </div>
        </div>

        <div className="footer__inferior">
          <p>© 2026 Banda Oriental. Hecho en Uruguay.</p>
          <ul>
            <li>
              <Link href="/terminos">Términos</Link>
            </li>
            <li>
              <Link href="/privacidad">Privacidad</Link>
            </li>
            <li>
              <Link href="/contacto">Contacto</Link>
            </li>
          </ul>
          <img className="footer__estrella" src="/assets/brand-asterisk.svg" alt="" width={40} height={40} />
        </div>
      </div>
    </footer>
  );
}
