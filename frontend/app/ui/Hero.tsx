import Link from "next/link";
import { GameCard } from "./GameCard";

const BENEFICIOS = [
  { color: "lila", icono: "icon-note", texto: ["Canciones", "uruguayas"] },
  { color: "rosa", icono: "icon-trophy", texto: ["Desafío", "diario"] },
  { color: "beige", icono: "icon-friends", texto: ["Competí", "con amigos"] },
] as const;

export function Hero() {
  return (
    <div className="hero-envoltorio">
      <img className="hero__mancha-violeta" src="/assets/hero-edge-purple.svg" alt="" aria-hidden="true" />
      <img className="hero__chispas-izq" src="/assets/hero-rays-left.svg" alt="" aria-hidden="true" />

      <section className="hero">
        <div className="hero__texto">
          <p className="hero__eyebrow">El juego de la música uruguaya</p>

          <h1 className="hero__titulo">
            <img
              src="/assets/headline-lettering.svg"
              alt="Adiviná la canción antes de que cante."
              width={516}
              height={223}
            />
          </h1>

          <p className="hero__bajada">
            Escuchá, pensá, probá. Seis intentos y cada error te da una pista más.
          </p>

          <div className="hero__acciones">
            <Link href="/jugar" className="boton boton--grande boton--violeta boton--ancho">
              <svg width="16" height="18" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
                <path d="M1 1.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 1 1.5Z" />
              </svg>
              Jugar la canción de hoy
              <svg className="boton__flecha" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12h15M13 6l6 6-6 6" />
              </svg>
            </Link>
            <a href="#como-se-juega" className="hero__como">
              ¿Cómo se juega?
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 1.5v9M2.5 7 6 10.5 9.5 7" />
              </svg>
            </a>
          </div>

          <ul className="hero__beneficios">
            {BENEFICIOS.map(({ color, icono, texto }) => (
              <li key={texto[0]} className="beneficio">
                <span className={`beneficio__icono beneficio__icono--${color}`} aria-hidden="true">
                  <img src={`/assets/${icono}.svg`} alt="" />
                </span>
                <span>
                  {texto[0]}
                  <br />
                  {texto[1]}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <img className="deco deco--rayos-titulo" src="/assets/hero-rays-claim.svg" alt="" />
          <img className="deco deco--rayita" src="/assets/hero-rays-tick.svg" alt="" />
          <img className="deco deco--rayitas-botones" src="/assets/hero-rays-pair.svg" alt="" />
          <img className="deco deco--rayos-arriba" src="/assets/hero-rays-top.svg" alt="" />
          {/* La mancha y el pincel amarillos son del diseño de celular; en escritorio no se ven. */}
          <img className="deco deco--mancha-amarilla" src="/assets/hero-blob-yellow.svg" alt="" />
          <img className="deco deco--pincel-amarillo" src="/assets/hero-brush-yellow.svg" alt="" />
          <img className="deco deco--mancha-violeta" src="/assets/hero-blob-purple.svg" alt="" />
          <img className="deco deco--mancha-rosa" src="/assets/hero-blob-pink.svg" alt="" />
          <img className="deco deco--mancha-rosa-der" src="/assets/hero-blob-pink.svg" alt="" />

          <div className="hero__tarjeta">
            <GameCard />
          </div>

          <img className="deco deco--sticker" src="/assets/sticker-six-attempts-pink.svg" alt="" />
          <img className="deco deco--rayos-foto" src="/assets/hero-rays-claim.svg" alt="" />
          <div className="deco deco--foto">
            <img src="/assets/hero-foto-salvo.webp" alt="" width={640} height={640} />
          </div>
          <img className="deco deco--flor" src="/assets/hero-asterisco.svg" alt="" />
          <div className="deco deco--nota">
            <img src="/assets/sticker-note.svg" alt="" />
          </div>
        </div>
      </section>
    </div>
  );
}
