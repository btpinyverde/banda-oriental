const TONOS = 5;

const SIMBOLOS = { cancion: "/assets/icon-note.svg", disco: "/assets/vinilo.svg", artista: "/assets/vinilo.svg" } as const;

/**
 * El bloque que ocupa el lugar de una tapa o una foto que no hay (o no carga): papel con grano, la nota (canciones) o un
 * vinilo (discos y artistas) y el asterisco del logo. El color del asterisco cambia con `lugar`, el de la tarjeta en la lista,
 * así varias seguidas sin imagen no salen iguales. Nunca se inventa una imagen.
 */
export function SinImagen({ tipo, lugar }: { tipo: keyof typeof SIMBOLOS; lugar: number }) {
  return (
    <div className="tarjeta__tapa tarjeta__tapa--sin tarjeta__tapa--vacia" aria-hidden="true">
      <img className={`vacia__simbolo vacia__simbolo--${tipo === "cancion" ? "nota" : "vinilo"}`} src={SIMBOLOS[tipo]} alt="" />
      <span className={`vacia__asterisco vacia__asterisco--tono-${((lugar % TONOS) + TONOS) % TONOS}`} />
    </div>
  );
}
