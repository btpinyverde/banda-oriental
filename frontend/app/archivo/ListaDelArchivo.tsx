import Link from "next/link";
import type { DiaDelArchivo } from "../lib/archivo";
import { diaYMes, mesYAnio } from "../lib/fechas";

/** Agrupa los días (ya ordenados del más nuevo al más viejo) por mes, conservando el orden. */
function agruparPorMes(dias: DiaDelArchivo[]): { mes: string; dias: DiaDelArchivo[] }[] {
  const grupos: { clave: string; mes: string; dias: DiaDelArchivo[] }[] = [];
  for (const dia of dias) {
    const clave = dia.date.slice(0, 7);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.clave === clave) ultimo.dias.push(dia);
    else grupos.push({ clave, mes: mesYAnio(dia.date), dias: [dia] });
  }
  return grupos;
}

/**
 * El archivo público: todos los días que ya vencieron, con su canción revelada. `dias` es `null` cuando no se pudo
 * consultar la API: se avisa del problema en vez de decir que no hay nada.
 */
export function ListaDelArchivo({ dias }: { dias: DiaDelArchivo[] | null }) {
  return (
    <main className="archivo-publico">
      <header className="archivo-publico__cabecera">
        <h1>Archivo</h1>
        <p>
          Todas las canciones de los días que ya pasaron. La canción de hoy no aparece hasta mañana, para no arruinar
          el juego.
        </p>
      </header>

      {dias === null && (
        <div className="archivo-publico__aviso" role="alert">
          <p>No pudimos cargar el archivo ahora. Probá de nuevo en un rato.</p>
        </div>
      )}

      {dias !== null && dias.length === 0 && (
        <div className="archivo-publico__aviso">
          <p>Todavía no hay días en el archivo: el primero aparece mañana, cuando venza el de hoy.</p>
          <Link href="/jugar" className="boton boton--grande boton--violeta">
            Jugar el diario
          </Link>
        </div>
      )}

      {dias !== null &&
        agruparPorMes(dias).map(({ mes, dias: delMes }) => (
          <section key={mes} className="archivo-publico__mes" aria-labelledby={`mes-${mes.replace(/\s+/g, "-")}`}>
            <h2 id={`mes-${mes.replace(/\s+/g, "-")}`}>{mes}</h2>
            <ul className="archivo-publico__lista">
              {delMes.map((dia) => (
                <li key={dia.date}>
                  <Link href={`/archivo/${dia.date}`} className="archivo-publico__dia">
                    <span className="archivo-publico__fecha">{diaYMes(dia.date)}</span>
                    <span className="archivo-publico__cancion">{dia.song_title}</span>
                    <span className="archivo-publico__artista">{dia.artist}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </main>
  );
}
