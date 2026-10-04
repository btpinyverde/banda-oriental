/**
 * Adornos del diseño de /jugar (puramente visuales, no se leen en voz alta). Se mezclan recursos de la home
 * (foto, mancha violeta, asterisco, rayitas) con piezas dibujadas para esta página (jugar-*.svg).
 */

/**
 * Columna izquierda, como en el diseño: pinceladas lilas lisas, la foto de papel rasgado con un recorte
 * encima y una nota de papel con el lema escrito a mano y una flor. Solo se ve en pantallas anchas.
 */
export function ColumnaDecorativa() {
  return (
    <aside className="jugar__deco" aria-hidden="true">
      <img className="jugar__pincelada jugar__pincelada--arriba" src="/assets/jugar-pincelada-arriba.svg" alt="" />
      <img className="jugar__rayo" src="/assets/jugar-garabato-rayo.svg" alt="" />
      <figure className="jugar__foto">
        <img className="jugar__foto-img" src="/assets/hero-foto-salvo.webp" alt="" width={640} height={640} />
        <img className="jugar__recorte" src="/assets/jugar-papel-recorte.svg" alt="" />
      </figure>
      <div className="jugar__nota">
        <img className="jugar__nota-papel" src="/assets/jugar-nota-papel.svg" alt="" />
        <img className="jugar__lema" src="/assets/jugar-lema.svg" alt="" />
        <img className="jugar__flor" src="/assets/jugar-flor.svg" alt="" />
      </div>
      <img className="jugar__mancha-nota jugar__mancha-nota--amarilla" src="/assets/jugar-mancha-amarilla-nota.svg" alt="" />
      <img className="jugar__mancha-nota jugar__mancha-nota--rosa" src="/assets/jugar-mancha-rosa-nota.svg" alt="" />
      <img className="jugar__garabato-bucle" src="/assets/jugar-garabato-bucle.svg" alt="" />
    </aside>
  );
}

/** Garabatos negros alrededor de la tarjeta, como en el diseño. Van dentro del contenedor de la tarjeta. */
export function Garabatos() {
  return (
    <>
      <img className="jugar__garabato jugar__garabato--izq" src="/assets/hero-rays-left.svg" alt="" aria-hidden="true" />
      <img className="jugar__garabato jugar__garabato--titulo" src="/assets/hero-rays-claim.svg" alt="" aria-hidden="true" />
      <img className="jugar__garabato jugar__garabato--arriba" src="/assets/hero-rays-top.svg" alt="" aria-hidden="true" />
      <img className="jugar__garabato jugar__garabato--marcas" src="/assets/jugar-garabato-marcas.svg" alt="" aria-hidden="true" />
    </>
  );
}

/** Adornos al pie de la escena, a la derecha: nota musical, flor y rayitas. */
export function DecoracionAbajo() {
  return (
    <div className="jugar__abajo" aria-hidden="true">
      <img className="jugar__abajo-marcas" src="/assets/jugar-garabato-marcas.svg" alt="" />
      <img className="jugar__abajo-nota" src="/assets/jugar-nota-musical.svg" alt="" />
      <img className="jugar__abajo-flor" src="/assets/jugar-flor.svg" alt="" />
    </div>
  );
}
