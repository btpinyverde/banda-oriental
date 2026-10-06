import Link from "next/link";
import { batallaActiva } from "../lib/funciones";

function Flecha() {
  return <img src="/assets/arrow-right.svg" alt="" width={18} height={18} />;
}

/**
 * Las dos tarjetas de modos de juego. `modo__icono` y `modo__arte` están
 * reservados para los SVG que todavía no están: el ícono del modo y la
 * ilustración de la derecha.
 */
export function ModeCards() {
  return (
    <section className="modos" aria-label="Modos de juego">
      <article className="modo modo--diario">
        <span className="modo__icono" aria-hidden="true">
          <img src="/assets/icon-sun.svg" alt="" />
        </span>
        <div className="modo__contenido">
          <h2 className="modo__titulo">Modo diario</h2>
          <p className="modo__texto">
            Una canción nueva todos los días.{" "}
            <br />
            La misma para todo el mundo.
          </p>
          <Link href="/jugar" className="modo__boton">
            Jugar hoy
            <Flecha />
          </Link>
        </div>
        <div className="modo__arte" aria-hidden="true">
          <img src="/assets/art-calendar.svg" alt="" />
        </div>
      </article>

      {batallaActiva() && (
        <article className="modo modo--batalla">
          <span className="modo__icono" aria-hidden="true">
            <img src="/assets/icon-swords-solid.svg" alt="" />
          </span>
          <div className="modo__contenido">
            <h2 className="modo__titulo">
              Modo batalla
              <span className="etiqueta-nuevo etiqueta-nuevo--en-linea">
                Nuevo
              </span>
            </h2>
            <p className="modo__texto">
              Competí con tus amigos en cinco canciones. ¿Quién adivina
              primero?
            </p>
            <Link href="/batalla" className="modo__boton">
              Invitar amigos
              <Flecha />
            </Link>
          </div>
          <div className="modo__arte modo__arte--versus" aria-hidden="true">
            <div className="versus">
              <img
                className="versus__rayas"
                src="/assets/hero-rays-top.svg"
                alt=""
              />
              <img
                className="versus__estrella"
                src="/assets/art-versus.svg"
                alt=""
              />
              <img
                className="versus__gorra"
                src="/assets/art-personaje-gorra.svg"
                alt=""
              />
              <img
                className="versus__rulos"
                src="/assets/art-personaje-rulos.svg"
                alt=""
              />
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
