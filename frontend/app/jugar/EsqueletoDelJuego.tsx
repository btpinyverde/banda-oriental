import "./esqueleto.css";

/**
 * Lo que se ve mientras llega el estado del día: la forma del juego dibujada en gris con un brillo que pasa
 * (cabecera, título, reproductor, las cuatro pistas, la tabla de intentos y el buscador). Sin esto la zona del juego
 * quedaba como un hueco vacío. El dibujo es solo decoración: lo único que se anuncia a los lectores de pantalla es el
 * aviso de carga.
 */
export function EsqueletoDelJuego({ tardando }: { tardando: boolean }) {
  return (
    <div className="jugar__tarjeta esqueleto" aria-busy="true">
      <p className="esqueleto__aviso" role="status">
        <span className="esqueleto__ecualizador" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        Cargando la canción de hoy…
      </p>
      {tardando && (
        <p className="jugar__espera">El servidor estaba dormido y está despertando. Puede tardar hasta un minuto.</p>
      )}

      <div className="esqueleto__dibujo" aria-hidden="true">
        <div className="jugar__cabecera">
          <span className="esqueleto__bloque esqueleto__chip" />
          <span className="esqueleto__bloque esqueleto__chip" />
          <span className="esqueleto__bloque esqueleto__chip esqueleto__chip--ancho" />
        </div>

        <span className="esqueleto__bloque esqueleto__titulo" />

        <div className="esqueleto__reproductor">
          <span className="esqueleto__bloque esqueleto__boton" />
          <span className="esqueleto__onda">
            {Array.from({ length: 30 }, (_, i) => (
              <span key={i} className="esqueleto__barra" style={{ height: `${25 + ((i * 37) % 65)}%` }} />
            ))}
          </span>
        </div>

        <div className="esqueleto__pistas">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="esqueleto__pista">
              <span className="esqueleto__bloque esqueleto__circulo" />
              <span className="esqueleto__bloque esqueleto__rotulo" />
            </span>
          ))}
        </div>

        <div className="esqueleto__tabla">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="esqueleto__bloque esqueleto__fila" />
          ))}
        </div>
        <span className="esqueleto__bloque esqueleto__buscador" />
      </div>
    </div>
  );
}
