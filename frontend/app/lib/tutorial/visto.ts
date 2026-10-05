// Clave propia, sin el prefijo de los datos del día en curso: aquellos se borran al cambiar de día y esto no.
const CLAVE = "banda-oriental:tutorial-visto";

/** Si en este dispositivo ya se vio (o se saltó) el tutorial. Con el almacenamiento bloqueado cuenta como visto: no hay dónde recordarlo y mostrarlo en cada visita cansa. */
export function tutorialVisto(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === "1";
  } catch {
    return true;
  }
}

export function marcarTutorialVisto(): void {
  try {
    window.localStorage.setItem(CLAVE, "1");
  } catch {
    // Almacenamiento bloqueado: no hay dónde recordarlo.
  }
}
