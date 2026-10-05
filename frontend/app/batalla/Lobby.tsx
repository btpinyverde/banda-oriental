"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { ApiBatallas, EstadoSala } from "../lib/batallas/api-batallas";

interface Props {
  sala: EstadoSala;
  api: ApiBatallas;
  hostToken?: string;
  refrescar: () => void;
}

/** La sala de espera: el enlace y el QR para sumar gente, quiénes entraron y, para quien organiza, el botón de empezar. */
export function Lobby({ sala, api, hostToken, refrescar }: Props) {
  const [enlace, setEnlace] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empezando, setEmpezando] = useState(false);
  const organiza = sala.role === "host";
  const minimo = sala.min_players ?? 2;
  const faltaGente = sala.players.length < Math.max(1, minimo);

  // El origen se conoce recién en el navegador: calcularlo al renderizar rompería la hidratación.
  useEffect(() => setEnlace(`${window.location.origin}/batalla/${sala.code}`), [sala.code]);
  useEffect(() => {
    if (!enlace) return;
    let activo = true;
    QRCode.toDataURL(enlace, { margin: 1, width: 240 })
      .then((url) => activo && setQr(url))
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [enlace]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      // Sin permiso para el portapapeles: el enlace está a la vista para copiarlo a mano.
    }
  }

  async function empezar() {
    setError(null);
    setEmpezando(true);
    try {
      await api.empezar(sala.code, hostToken);
      refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos empezar. Probá de nuevo.");
      setEmpezando(false);
    }
  }

  return (
    <section className="batalla__tarjeta">
      <h1 className="batalla__titulo">{sala.title || "Batalla"}</h1>
      <p className="batalla__bajada">
        {sala.round_count} canciones, {sala.round_seconds} segundos cada una. Compartí este enlace para que se sumen:
      </p>
      <div className="batalla__enlace">
        <input readOnly value={enlace} aria-label="Enlace de la sala" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="boton boton--violeta-claro" onClick={copiar}>
          {copiado ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
      {qr && <img className="batalla__qr" src={qr} alt="Código QR de la sala" width={240} height={240} />}

      <h2 className="batalla__subtitulo">En la sala ({sala.players.length})</h2>
      <ul className="batalla__jugadores">
        {sala.players.map((j) => (
          <li key={j.name}>{j.name}</li>
        ))}
      </ul>

      {organiza ? (
        <>
          <p className="batalla__nota">Quien organiza no juega: ves el avance y los resultados.</p>
          {error && (
            <p className="batalla__error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="boton boton--violeta" onClick={empezar} disabled={faltaGente || empezando}>
            {empezando ? "Empezando…" : "Empezar"}
          </button>
          {faltaGente && <p className="batalla__nota">{minimo > 1 ? "Hace falta al menos otra persona para jugar." : "Hace falta que entre alguien para jugar."}</p>}
        </>
      ) : (
        <p className="batalla__nota">Esperando que empiece…</p>
      )}
    </section>
  );
}
