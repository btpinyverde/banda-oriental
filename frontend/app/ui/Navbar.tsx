import Link from "next/link";
import { BotonCuenta } from "./BotonCuenta";
import { MenuMovil } from "./MenuMovil";

const ENLACES = [
  { href: "/jugar", etiqueta: "Jugar" },
  { href: "/batalla", etiqueta: "Batalla" },
  { href: "/archivo", etiqueta: "Archivo" },
  { href: "/ranking", etiqueta: "Ranking" },
  { href: "/acerca", etiqueta: "Acerca de" },
];

/** `actual` es la ruta de la página donde está: se marca en los enlaces y, en /jugar, se oculta el botón de jugar. */
export function Navbar({ actual }: { actual?: string }) {
  return (
    <header className="navbar">
      <Link href="/" className="navbar__logo">
        <img src="/assets/brand-wordmark.svg" alt="Banda Oriental" width={108} height={58} />
      </Link>

      <nav aria-label="Principal">
        <ul className="navbar__links">
          {ENLACES.map(({ href, etiqueta }) => (
            <li key={href}>
              <Link href={href} className="navbar__link" aria-current={href === actual ? "page" : undefined}>
                {etiqueta}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="navbar__acciones">
        <BotonCuenta className="boton boton--claro" />
        {actual !== "/jugar" && (
          <Link href="/jugar" className="boton boton--violeta">
            <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
              <path d="M1 1.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 1 1.5Z" />
            </svg>
            Jugar el diario
          </Link>
        )}
      </div>

      <MenuMovil enlaces={ENLACES} actual={actual} />
    </header>
  );
}
