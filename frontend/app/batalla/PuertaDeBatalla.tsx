"use client";

import { usePuedeCrearBatallas } from "../lib/batallas/usePuedeCrearBatallas";
import { CrearBatalla } from "./CrearBatalla";

/**
 * Crear una sala es solo para las cuentas autorizadas mientras se prueba el modo. A las demás personas la página les dice
 * lo mismo que cualquier página que no existe: no hay ninguna pista de que haya un modo batalla.
 */
export function PuertaDeBatalla() {
  const { puede, lista } = usePuedeCrearBatallas();
  if (!lista) return <main className="batalla" aria-busy="true" />;
  if (!puede) {
    return (
      <main className="batalla">
        <section className="batalla__tarjeta">
          <h1 className="batalla__titulo">No encontramos esta página</h1>
          <p className="batalla__bajada">Puede que el enlace esté mal escrito.</p>
        </section>
      </main>
    );
  }
  return <CrearBatalla />;
}
