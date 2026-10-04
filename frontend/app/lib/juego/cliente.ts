import { crearClienteDemo } from "./cliente-demo";
import { crearClienteHttp } from "./cliente-http";
import type { ClienteJuego } from "./tipos";

/**
 * El cliente real, salvo que se pida una demostración (nunca en un build de producción, aunque la variable
 * quede puesta por error):
 * - NEXT_PUBLIC_JUEGO_DEMO=1: todo de ejemplo, sin red.
 * - NEXT_PUBLIC_JUEGO_DEMO=catalogo-real: canción del día de ejemplo, pero el buscador usa el catálogo real
 *   de la API (`GET /api/songs/`). Sirve para probar la búsqueda mientras no hay canción del día publicada.
 */
const modoDemo = () => (process.env.NODE_ENV === "production" ? undefined : process.env.NEXT_PUBLIC_JUEGO_DEMO);

/** Verdadero en cualquiera de las demostraciones. Sirve para mostrar maquetas con datos de ejemplo solo ahí. */
export function esModoDemo(): boolean {
  return modoDemo() === "1" || modoDemo() === "catalogo-real";
}

export function crearCliente(): ClienteJuego {
  const modo = modoDemo();
  if (modo === "1") return crearClienteDemo();
  if (modo === "catalogo-real") return crearClienteDemo(() => crearClienteHttp().listarCanciones());
  return crearClienteHttp();
}
