import type { Modo } from "./FormularioCuenta";

const ESTRELLA = "117,60 101.5,71.1 109.4,88.5 90.4,90.4 88.5,109.4 71.1,101.5 60,117 48.9,101.5 31.5,109.4 29.6,90.4 10.6,88.5 18.5,71.1 3,60 18.5,48.9 10.6,31.5 29.6,29.6 31.5,10.6 48.9,18.5 60,3 71.1,18.5 88.5,10.6 90.4,29.6 109.4,31.5 101.5,48.9";

/** El casete con "URUGUAY" de la pantalla de crear la cuenta (dibujado acá: no hay un recurso para esto). */
function Casete() {
  return (
    <svg className="colage-acceso__casete" viewBox="0 0 320 210" fill="none">
      <rect x="6" y="6" width="308" height="198" rx="22" fill="#1c1b1f" stroke="#0c0c0c" strokeWidth="4" />
      <rect x="30" y="26" width="260" height="104" rx="10" fill="#f4efe3" />
      <text x="160" y="92" textAnchor="middle" fontFamily="Caveat Brush, cursive" fontSize="46" fill="#0c0c0c" letterSpacing="3">URUGUAY</text>
      <rect x="56" y="104" width="208" height="16" rx="8" fill="#d9d2c0" />
      <circle cx="96" cy="154" r="20" fill="#e9e5db" stroke="#0c0c0c" strokeWidth="4" />
      <circle cx="224" cy="154" r="20" fill="#e9e5db" stroke="#0c0c0c" strokeWidth="4" />
      <circle cx="96" cy="154" r="7" fill="#0c0c0c" />
      <circle cx="224" cy="154" r="7" fill="#0c0c0c" />
      <path d="M118 170h84l10 24H108Z" fill="#2c2b30" />
    </svg>
  );
}

/**
 * Los collages de las pantallas de entrar y de crear la cuenta (puramente visuales, no se leen en voz alta): notas de papel
 * escritas a mano, la foto del edificio o un casete, manchas, estrellas y Flan con los auriculares. Piezas del diseño del sitio.
 */
export function ColageDelAcceso({ modo }: { modo: Modo }) {
  const crear = modo === "crear";
  return (
    <div className={`colage-acceso colage-acceso--${modo}`} aria-hidden="true">
      <img className="colage-acceso__mancha-amarilla" src="/assets/hero-blob-yellow.svg" alt="" />
      <img className="colage-acceso__mancha-lila" src="/assets/hero-blob-purple.svg" alt="" />
      {crear ? <img className="colage-acceso__mancha-rosa" src="/assets/hero-blob-pink.svg" alt="" /> : null}

      {crear ? (
        <>
          <div className="colage-acceso__nota colage-acceso__nota--lila">
            <span>Jugá,</span>
            <span>compartí</span>
            <span>y descubrí</span>
            <span>nueva música</span>
            <span>uruguaya.</span>
          </div>
          <Casete />
          <svg className="colage-acceso__corona" viewBox="0 0 64 44" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 38 4 8l16 14L32 4l12 18L60 8l-2 30Z" />
          </svg>
          <svg className="colage-acceso__estrella colage-acceso__estrella--negra" viewBox="0 0 120 120">
            <polygon fill="currentColor" points={ESTRELLA} />
          </svg>
        </>
      ) : (
        <>
          <div className="colage-acceso__nota colage-acceso__nota--rosa">
            <span>Mismas</span>
            <span>canciones.</span>
            <span>Más</span>
            <span>competencia.</span>
          </div>
          <figure className="colage-acceso__foto">
            <img src="/assets/hero-foto-salvo.webp" alt="" width={420} height={420} />
          </figure>
          <svg className="colage-acceso__estrella" viewBox="0 0 120 120">
            <polygon fill="currentColor" points={ESTRELLA} />
          </svg>
          <img className="colage-acceso__musica" src="/assets/jugar-nota-musical.svg" alt="" />
          <div className="colage-acceso__nota colage-acceso__nota--verde">
            <span>Guardá</span>
            <span>tu progreso</span>
            <span>y seguí</span>
            <span>jugando</span>
            <span>desde cualquier</span>
            <span>dispositivo.</span>
          </div>
          <img className="colage-acceso__flecha" src="/assets/hero-curved-arrow.svg" alt="" />
        </>
      )}

      <img className="colage-acceso__flan" src="/assets/flan_footer.webp" alt="" width={420} height={420} />
      <img className="colage-acceso__rayas colage-acceso__rayas--a" src="/assets/hero-rays-top.svg" alt="" />
      <img className="colage-acceso__rayas colage-acceso__rayas--b" src="/assets/hero-rays-left.svg" alt="" />
    </div>
  );
}
