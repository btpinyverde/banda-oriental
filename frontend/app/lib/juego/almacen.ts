import type { CancionCatalogo } from "./tipos";

const PREFIJO = "banda-oriental:juego:";

interface DiaGuardado {
  intentos: Record<number, CancionCatalogo>;
  segundos: number;
}

const vacio = (): DiaGuardado => ({ intentos: {}, segundos: 0 });

function leer(dia: string): DiaGuardado {
  try {
    const crudo = window.localStorage.getItem(PREFIJO + dia);
    if (!crudo) return vacio();
    const datos = JSON.parse(crudo) as Partial<DiaGuardado>;
    return { intentos: datos.intentos ?? {}, segundos: Number(datos.segundos) || 0 };
  } catch {
    return vacio();
  }
}

/** Guarda el día y borra los de días anteriores, para que el navegador no acumule datos. */
function escribir(dia: string, datos: DiaGuardado) {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const clave = window.localStorage.key(i);
      if (clave?.startsWith(PREFIJO) && clave !== PREFIJO + dia) window.localStorage.removeItem(clave);
    }
    window.localStorage.setItem(PREFIJO + dia, JSON.stringify(datos));
  } catch {
    // Almacenamiento bloqueado: el juego sigue, solo que la tabla no sobrevive a una recarga.
  }
}

/**
 * El backend devuelve solo el color de cada celda de un intento. Para mostrar qué canción se adivinó
 * (título, año, género...) la tabla usa lo que se guardó acá al jugar.
 */
export function guardarIntento(dia: string, numero: number, cancion: CancionCatalogo) {
  const datos = leer(dia);
  datos.intentos[numero] = cancion;
  escribir(dia, datos);
}

export function leerIntentos(dia: string): Record<number, CancionCatalogo> {
  return leer(dia).intentos;
}

/** Tiempo que la persona estuvo escuchando, acumulado entre intentos, para el bono de velocidad. */
export function sumarSegundos(dia: string, segundos: number) {
  const datos = leer(dia);
  datos.segundos += segundos;
  escribir(dia, datos);
}

export function leerSegundos(dia: string): number {
  return leer(dia).segundos;
}
