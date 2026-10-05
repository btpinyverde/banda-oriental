"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { crearApiBatallas, guardarHostToken, type ApiBatallas } from "../lib/batallas/api-batallas";

const RONDAS = { min: 3, max: 30, porDefecto: 10 };
const SEGUNDOS = { min: 5, max: 60, porDefecto: 20 };

/** Crea la sala de una batalla: quien la crea la organiza (no juega) y comparte el enlace con los demás. */
export function CrearBatalla({ api }: { api?: ApiBatallas }) {
  const cliente = useMemo(() => api ?? crearApiBatallas(), [api]);
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [rondas, setRondas] = useState(String(RONDAS.porDefecto));
  const [segundos, setSegundos] = useState(String(SEGUNDOS.porDefecto));
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const cantidad = Number(rondas);
    const duracion = Number(segundos);
    if (!Number.isInteger(cantidad) || cantidad < RONDAS.min || cantidad > RONDAS.max) {
      return setError(`Las canciones tienen que ser entre ${RONDAS.min} y ${RONDAS.max}.`);
    }
    if (!Number.isInteger(duracion) || duracion < SEGUNDOS.min || duracion > SEGUNDOS.max) {
      return setError(`Los segundos por ronda tienen que ser entre ${SEGUNDOS.min} y ${SEGUNDOS.max}.`);
    }
    setError(null);
    setCreando(true);
    try {
      const sala = await cliente.crear({ rondas: cantidad, segundos: duracion, titulo });
      guardarHostToken(sala.code, sala.host_token);
      router.push(`/batalla/${sala.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos crear la sala. Probá de nuevo.");
      setCreando(false);
    }
  }

  return (
    <main className="batalla">
      <form className="batalla__tarjeta" onSubmit={enviar} noValidate>
        <h1 className="batalla__titulo">Creá una batalla</h1>
        <p className="batalla__bajada">
          Armás la sala, compartís el enlace y los demás juegan las mismas canciones al mismo tiempo. Vos organizás: no jugás.
        </p>
        <label className="batalla__campo">
          Título (opcional)
          <input value={titulo} maxLength={60} onChange={(e) => setTitulo(e.target.value)} placeholder="Cumple de Ana" />
        </label>
        <label className="batalla__campo">
          Canciones
          <input inputMode="numeric" value={rondas} onChange={(e) => setRondas(e.target.value)} />
        </label>
        <label className="batalla__campo">
          Segundos por ronda
          <input inputMode="numeric" value={segundos} onChange={(e) => setSegundos(e.target.value)} />
        </label>
        {error && (
          <p className="batalla__error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="boton boton--violeta" disabled={creando}>
          {creando ? "Creando…" : "Crear sala"}
        </button>
      </form>
    </main>
  );
}
