import Link from "next/link";
import { GameCard } from "./GameCard";

const BENEFICIOS = [
  { color: "amarillo", icono: "icon-note", texto: ["Canciones", "uruguayas"] },
  { color: "coral", icono: "icon-trophy", texto: ["Desafío", "diario"] },
  { color: "menta", icono: "icon-friends", texto: ["Competí", "con amigos"] },
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
            Escuchá, pensá, probá. Tenés seis intentos y cada error te destapa un instrumento más.
          </p>

          <div className="hero__acciones">
            <Link href="/jugar" className="boton boton--grande boton--violeta">
              <svg width="16" height="18" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
                <path d="M1 1.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 1 1.5Z" />
              </svg>
              Jugar el diario
            </Link>
            <Link href="/batalla" className="boton boton--grande boton--claro boton--con-etiqueta">
              <img src="/assets/icon-swords-solid.svg" alt="" width={34} height={34} />
              Modo batalla
              <span className="etiqueta-nuevo">Nuevo</span>
            </Link>
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
          <img className="deco deco--mancha-amarilla" src="/assets/hero-blob-yellow.svg" alt="" />
          <img className="deco deco--mancha-violeta" src="/assets/hero-blob-purple.svg" alt="" />
          <img className="deco deco--mancha-rosa" src="/assets/hero-blob-pink.svg" alt="" />
          <img className="deco deco--pincel-amarillo" src="/assets/hero-brush-yellow.svg" alt="" />

          <div className="hero__tarjeta">
            <GameCard />
          </div>

          <img className="deco deco--sticker" src="/assets/sticker-six-attempts.svg" alt="" />
          <img className="deco deco--flecha" src="/assets/hero-curved-arrow.svg" alt="" />
          <img className="deco deco--rayos-foto" src="/assets/hero-rays-claim.svg" alt="" />
          <div className="deco deco--foto">
            <img src="/assets/hero-foto-salvo.webp" alt="" width={640} height={640} />
          </div>
          <img className="deco deco--flor" src="/assets/hero-flower.svg" alt="" />
          <div className="deco deco--nota">
            <img src="/assets/sticker-note.svg" alt="" />
          </div>
        </div>
      </section>
    </div>
  );
}
