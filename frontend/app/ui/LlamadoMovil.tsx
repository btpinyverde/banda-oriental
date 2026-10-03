import Link from "next/link";

/**
 * Bloque de cierre que solo se ve en celular (el CSS lo oculta en desktop, donde Flan vive en el footer):
 * una invitación a crear cuenta y el recordatorio de las reglas.
 */
export function LlamadoMovil() {
  return (
    <section className="llamado" aria-labelledby="llamado-titulo">
      <div className="llamado__tarjeta">
        <h2 className="llamado__titulo" id="llamado-titulo">
          La música también nos encuentra.
        </h2>
        <p className="llamado__texto">Jugá, descubrí artistas, compartí con otros y mantené viva la música uruguaya.</p>
        <Link href="/login" className="boton boton--violeta">
          Crear cuenta gratis
          <img src="/assets/arrow-right.svg" alt="" width={18} height={18} style={{ filter: "brightness(0) invert(1)" }} />
        </Link>

        <div className="llamado__arte" aria-hidden="true">
          <img className="llamado__rayas" src="/assets/hero-rays-claim.svg" alt="" />
          <img className="llamado__flan" src="/assets/flan_footer.webp" alt="" width={760} height={695} />
        </div>
      </div>

      <div className="llamado__recordatorio" aria-hidden="true">
        <img className="llamado__rayas-sticker" src="/assets/hero-rays-top.svg" alt="" />
        <img className="llamado__sticker" src="/assets/sticker-six-attempts-pink.svg" alt="" />
      </div>
    </section>
  );
}
