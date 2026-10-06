/**
 * El collage del encabezado del archivo (puramente visual, no se lee en voz alta): un casete (foto) con el logo en una línea
 * sobre su etiqueta, sobre las manchas violeta y amarilla, la nota rosa escrita a mano, un rayo, rayitas y un garabato. Piezas del diseño del sitio.
 */
export function ColageDelArchivo() {
  return (
    <div className="colage" aria-hidden="true">
      <img className="colage__mancha colage__mancha--violeta" src="/assets/hero-blob-purple.svg" alt="" />
      <img className="colage__mancha colage__mancha--amarilla" src="/assets/hero-blob-yellow.svg" alt="" />
      <img className="colage__rayo" src="/assets/rayo-grueso.svg" alt="" />
      <img className="colage__rayas colage__rayas--arriba" src="/assets/doodle-rays.svg" alt="" />
      <div className="colage__casete">
        <img className="colage__casete-foto" src="/assets/casete.webp" alt="" width={1100} height={550} />
        <img className="colage__casete-logo" src="/assets/brand-wordmark-linea.svg" alt="" />
      </div>
      <div className="colage__nota">
        <span>Rock,</span>
        <span>candombe,</span>
        <span>pop, tango,</span>
        <span>electrónica</span>
        <span>y mucho más.</span>
      </div>
      <img className="colage__rayas colage__rayas--der" src="/assets/hero-rays-left.svg" alt="" />
      <img className="colage__rayas colage__rayas--abajo" src="/assets/hero-rays-top.svg" alt="" />
      <img className="colage__garabato" src="/assets/garabato-onda.svg" alt="" />
    </div>
  );
}
