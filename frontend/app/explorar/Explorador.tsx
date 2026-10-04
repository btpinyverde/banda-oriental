"use client";

import { useMemo, useState } from "react";
import type { GrupoDeDiscos } from "../lib/catalogo";

const DE_A = 40;

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Props {
  grupos: GrupoDeDiscos[];
  /** Muestra de quién es cada disco (para épocas y géneros, donde los discos de artistas distintos van juntos). */
  conArtista?: boolean;
  /** Ofrece un buscador por el nombre del grupo (para artistas y géneros, que son muchos). */
  buscable?: boolean;
  vacio?: string;
}

/**
 * Una lista de grupos de discos (artistas, décadas o géneros), cada uno desplegable. Para no cargar de golpe la
 * página con miles de discos, se muestran de a 40 grupos; el buscador mira siempre en todos.
 */
export function Explorador({ grupos, conArtista = false, buscable = false, vacio = "Todavía no hay nada para mostrar." }: Props) {
  const [consulta, setConsulta] = useState("");
  const [visibles, setVisibles] = useState(DE_A);

  const filtrados = useMemo(() => {
    const buscado = normalizar(consulta.trim());
    return buscado ? grupos.filter((g) => normalizar(g.etiqueta).includes(buscado)) : grupos;
  }, [grupos, consulta]);

  return (
    <div className="explorador">
      {buscable && (
        <input
          type="search"
          className="explorador__buscador"
          placeholder="Buscar…"
          aria-label="Buscar"
          value={consulta}
          onChange={(e) => {
            setConsulta(e.target.value);
            setVisibles(DE_A);
          }}
        />
      )}

      {grupos.length === 0 && <p className="explorador__vacio">{vacio}</p>}
      {grupos.length > 0 && filtrados.length === 0 && <p className="explorador__vacio">No encontramos nada para “{consulta.trim()}”.</p>}

      {filtrados.slice(0, visibles).map((grupo) => (
        <details key={grupo.clave} className="explorador__grupo">
          <summary>
            <span className="explorador__nombre">{grupo.etiqueta}</span>
            <span className="explorador__cuenta">{plural(grupo.discos.length, "disco", "discos")}</span>
          </summary>
          <ul>
            {grupo.discos.map((disco) => (
              <li key={`${disco.artista}-${disco.disco}-${disco.anio}`}>
                <strong>{disco.disco}</strong>
                {disco.anio !== null && <span> ({disco.anio})</span>}
                {conArtista && <span> · {disco.artista}</span>}
                <span className="explorador__canciones"> · {plural(disco.canciones, "canción", "canciones")}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}

      {filtrados.length > visibles && (
        <button type="button" className="boton boton--violeta" onClick={() => setVisibles((n) => n + DE_A)}>
          Mostrar más
        </button>
      )}
    </div>
  );
}
