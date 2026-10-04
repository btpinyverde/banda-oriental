import { FilaStems } from "./FilaStems";

/**
 * Lo que se ve mientras llega el estado del día: la forma del juego (cabecera, título, reproductor, pistas, tabla y
 * buscador) en gris, con una ventana de carga encima. Sin esto la zona del juego quedaba como un hueco vacío.
 * Es solo decoración: lo único que se anuncia a los lectores de pantalla es el aviso de carga.
 */
export function EsqueletoDelJuego({ tardando }: { tardando: boolean }) {
  return (
    <div className="jugar__tarjeta esqueleto" aria-busy="true">
      <div className="jugar__cabecera" aria-hidden="true">
        <span className="esqueleto__bloque esqueleto__chip" />
        <span className="esqueleto__bloque esqueleto__chip" />
        <span className="esqueleto__bloque esqueleto__chip esqueleto__chip--ancho" />
      </div>

      <div className="jugar__titulo-fila">
        <h1 className="jugar__titulo">¿Qué canción es?</h1>
      </div>

      <div className="esqueleto__reproductor" aria-hidden="true">
        <span className="esqueleto__bloque esqueleto__boton" />
        <span className="esqueleto__onda">
          {Array.from({ length: 28 }, (_, i) => (
            <span key={i} className="esqueleto__barra" style={{ height: `${28 + ((i * 37) % 60)}%` }} />
          ))}
        </span>
      </div>

      <FilaStems desbloqueadas={[]} />

      <div className="esqueleto__tabla" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="esqueleto__bloque esqueleto__fila" />
        ))}
      </div>
      <span className="esqueleto__bloque esqueleto__buscador" aria-hidden="true" />

      <div className="esqueleto__ventana">
        <span className="esqueleto__ecualizador" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <p role="status">Cargando la canción de hoy…</p>
        {tardando && (
          <p className="jugar__espera">El servidor estaba dormido y está despertando. Puede tardar hasta un minuto.</p>
        )}
      </div>
    </div>
  );
}
