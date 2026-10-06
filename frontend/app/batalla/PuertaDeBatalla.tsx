"use client";

import Link from "next/link";
import { batallaActiva } from "../lib/funciones";
import { usePuedeCrearBatallas } from "../lib/batallas/usePuedeCrearBatallas";
import { CrearBatalla } from "./CrearBatalla";

/**
 * Crear una sala depende de lo que diga el servidor. Con el modo visible, quien todavía no puede crear le explicamos que se está
 * probando (y que entrar a una sala con su enlace sí se puede). Con el modo apagado, la página dice lo mismo que cualquier página
 * que no existe: no hay ninguna pista de que haya un modo batalla.
 */
export function PuertaDeBatalla() {
  const { puede, lista } = usePuedeCrearBatallas();
  if (!lista) return <main className="batalla" aria-busy="true" />;
  if (puede) return <CrearBatalla />;

  if (batallaActiva()) {
    return (
      <main className="batalla">
        <section className="batalla__tarjeta">
          <h1 className="batalla__titulo">Estamos probando las batallas</h1>
          <p className="batalla__bajada">
            Por ahora crear una sala está abierto a un grupo chico. Si alguien te pasó el enlace de una sala, abrilo y entrás a jugar; y
            mientras tanto podés jugar la canción del día.
          </p>
          <Link href="/jugar" className="boton boton--violeta">
            Jugar el diario
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="batalla">
      <section className="batalla__tarjeta">
        <h1 className="batalla__titulo">No encontramos esta página</h1>
        <p className="batalla__bajada">Puede que el enlace esté mal escrito.</p>
      </section>
    </main>
  );
}
