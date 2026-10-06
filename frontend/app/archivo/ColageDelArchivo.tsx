/** Un casete dibujado, para el collage del encabezado: cuerpo crema, etiqueta con el nombre, ventana con los carretes y la base. */
function Casete() {
  return (
    <svg className="colage__casete" viewBox="0 0 400 262" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="388" height="250" rx="18" fill="#efe9d8" stroke="#14110f" strokeWidth="6" />
      <rect x="40" y="26" width="320" height="104" rx="8" fill="#f8f4e8" stroke="#14110f" strokeWidth="4" />
      <path d="M40 112h150l-20 18H40z" fill="#6a4ae6" opacity="0.9" />
      <text x="182" y="82" textAnchor="middle" fontFamily="'Caveat Brush', cursive" fontSize="34" fill="#14110f" letterSpacing="1">
        BANDA ORIENTAL
      </text>
      <g transform="translate(318 62)" fill="#ffdc58">
        <path d="M0-14v28M-14 0h28M-10-10l20 20M10-10l-20 20" stroke="#ffdc58" strokeWidth="5" strokeLinecap="round" />
      </g>
      <rect x="78" y="136" width="244" height="72" rx="36" fill="#14110f" />
      <g stroke="#efe9d8" strokeWidth="4">
        <circle cx="132" cy="172" r="26" fill="#efe9d8" />
        <circle cx="268" cy="172" r="26" fill="#efe9d8" />
      </g>
      <g fill="#14110f">
        <circle cx="132" cy="172" r="12" />
        <circle cx="268" cy="172" r="12" />
      </g>
      <g stroke="#efe9d8" strokeWidth="3" strokeLinecap="round">
        <path d="M132 160v24M120 172h24M268 160v24M256 172h24" />
      </g>
      <rect x="176" y="164" width="48" height="16" rx="4" fill="#efe9d8" stroke="#14110f" strokeWidth="3" />
      <path d="M70 256l20-40h220l20 40z" fill="#d9d2bd" stroke="#14110f" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="116" cy="236" r="8" fill="#14110f" />
      <circle cx="284" cy="236" r="8" fill="#14110f" />
      <circle cx="200" cy="236" r="6" fill="#14110f" />
      <circle cx="24" cy="24" r="6" fill="#14110f" />
      <circle cx="376" cy="24" r="6" fill="#14110f" />
      <circle cx="24" cy="238" r="6" fill="#14110f" />
      <circle cx="376" cy="238" r="6" fill="#14110f" />
    </svg>
  );
}

/**
 * El collage del encabezado del archivo (puramente visual, no se lee en voz alta): un casete sobre las manchas violeta y
 * amarilla, la nota rosa escrita a mano, un rayo, rayitas y un garabato. Piezas del diseño del sitio.
 */
export function ColageDelArchivo() {
  return (
    <div className="colage" aria-hidden="true">
      <img className="colage__mancha colage__mancha--violeta" src="/assets/hero-blob-purple.svg" alt="" />
      <img className="colage__mancha colage__mancha--amarilla" src="/assets/hero-blob-yellow.svg" alt="" />
      <Casete />
      <img className="colage__rayo" src="/assets/jugar-garabato-rayo.svg" alt="" />
      <img className="colage__garabato" src="/assets/doodle-scribble.svg" alt="" />
      <div className="colage__nota">
        <span>Rock,</span>
        <span>candombe,</span>
        <span>pop, tango,</span>
        <span>electrónica</span>
        <span>y mucho más.</span>
      </div>
      <img className="colage__rayas colage__rayas--arriba" src="/assets/hero-rays-top.svg" alt="" />
      <img className="colage__rayas colage__rayas--der" src="/assets/hero-rays-left.svg" alt="" />
      <img className="colage__rayas colage__rayas--abajo" src="/assets/hero-rays-claim.svg" alt="" />
    </div>
  );
}
