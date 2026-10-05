/**
 * El collage del encabezado del archivo (puramente visual, no se lee en voz alta): la foto de papel con el edificio, una
 * nota rosa escrita a mano, una mancha amarilla, una estrella violeta y rayitas. Piezas del diseño del sitio.
 */
export function ColageDelArchivo() {
  return (
    <div className="colage" aria-hidden="true">
      <img className="colage__mancha" src="/assets/hero-blob-yellow.svg" alt="" />
      <figure className="colage__foto">
        <img src="/assets/hero-foto-salvo.webp" alt="" width={560} height={560} />
      </figure>
      <div className="colage__nota">
        <span>Del rock</span>
        <span>al candombe,</span>
        <span>del pop</span>
        <span>a la electrónica</span>
      </div>
      <svg className="colage__estrella" viewBox="0 0 120 120" fill="none">
        <polygon
          fill="currentColor"
          points="117,60 101.5,71.1 109.4,88.5 90.4,90.4 88.5,109.4 71.1,101.5 60,117 48.9,101.5 31.5,109.4 29.6,90.4 10.6,88.5 18.5,71.1 3,60 18.5,48.9 10.6,31.5 29.6,29.6 31.5,10.6 48.9,18.5 60,3 71.1,18.5 88.5,10.6 90.4,29.6 109.4,31.5 101.5,48.9"
        />
      </svg>
      <img className="colage__rayas colage__rayas--izq" src="/assets/hero-rays-top.svg" alt="" />
      <img className="colage__rayas colage__rayas--der" src="/assets/hero-rays-left.svg" alt="" />
    </div>
  );
}
