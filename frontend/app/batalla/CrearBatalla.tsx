"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { crearApiBatallas, guardarHostToken, type ApiBatallas, type FiltrosAzar } from "../lib/batallas/api-batallas";
import { filtrosDelArchivo, listarArtistas } from "../lib/archivo-musical";
import { crearClienteHttp } from "../lib/juego/cliente-http";
import type { CancionCatalogo } from "../lib/juego/tipos";
import { FiltrosDelAzar } from "./FiltrosDelAzar";
import { ListaElegida, type ItemConDatos } from "./ListaElegida";

const RONDAS = { min: 3, max: 30, porDefecto: 10 };
const SEGUNDOS = { min: 5, max: 60, porDefecto: 20 };
const SIN_FILTROS: FiltrosAzar = { include: {}, exclude: {} };
const hayFiltros = (f: FiltrosAzar) => Object.keys(f.include).length > 0 || Object.keys(f.exclude).length > 0;

interface Props {
  api?: ApiBatallas;
  /** Para los tests: de dónde salen el catálogo, los géneros y la búsqueda de artistas. */
  cargarCanciones?: () => Promise<CancionCatalogo[]>;
  cargarGeneros?: () => Promise<string[]>;
  buscarArtistas?: (texto: string) => Promise<{ id: number; name: string }[]>;
}

const generosDelArchivo = async () => (await filtrosDelArchivo())?.genres.map((g) => g.genre) ?? [];
const artistasDelArchivo = async (texto: string) => ((await listarArtistas({ q: texto, porPagina: 8 }))?.results ?? []).map((a) => ({ id: a.id, name: a.name }));

/** Crea la sala de una batalla: quien la crea la organiza (no juega) y comparte el enlace con los demás. */
export function CrearBatalla({
  api,
  cargarCanciones = () => crearClienteHttp().listarCanciones(),
  cargarGeneros = generosDelArchivo,
  buscarArtistas = artistasDelArchivo,
}: Props) {
  const cliente = useMemo(() => api ?? crearApiBatallas(), [api]);
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [rondas, setRondas] = useState(String(RONDAS.porDefecto));
  const [segundos, setSegundos] = useState(String(SEGUNDOS.porDefecto));
  const [audioMode, setAudioMode] = useState<"each" | "host">("each");
  const [joinMode, setJoinMode] = useState<"open" | "approval">("open");
  const [modoDeCanciones, setModoDeCanciones] = useState<"random" | "list">("random");
  const [filtros, setFiltros] = useState<FiltrosAzar>(SIN_FILTROS);
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [lista, setLista] = useState<ItemConDatos[]>([]);
  const [equipos, setEquipos] = useState<"none" | "random" | "manual">("none");
  const [cantidadDeEquipos, setCantidadDeEquipos] = useState("2");
  const [nombresDeEquipos, setNombresDeEquipos] = useState<string[]>([]);
  const [generos, setGeneros] = useState<string[]>([]);
  const [canciones, setCanciones] = useState<CancionCatalogo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    let activo = true;
    cargarGeneros()
      .then((g) => activo && setGeneros(g))
      .catch(() => {});
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El catálogo (para buscar canciones) solo hace falta si se arma la lista a mano.
  useEffect(() => {
    if (modoDeCanciones !== "list" || canciones.length > 0) return;
    let activo = true;
    cargarCanciones()
      .then((c) => activo && setCanciones(c))
      .catch(() => {});
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoDeCanciones]);

  // Cuenta cuántas canciones cumplen los filtros (sin pedir en cada tecla). Sin filtros no hay nada que contar.
  useEffect(() => {
    if (modoDeCanciones !== "random" || !hayFiltros(filtros)) {
      setCantidad(null);
      return;
    }
    let activo = true;
    setCantidad(null);
    const espera = setTimeout(() => {
      cliente
        .pool(filtros)
        .then((n) => activo && setCantidad(n))
        .catch(() => {});
    }, 400);
    return () => {
      activo = false;
      clearTimeout(espera);
    };
  }, [cliente, filtros, modoDeCanciones]);

  async function enviar() {
    const duracion = Number(segundos);
    if (!Number.isInteger(duracion) || duracion < SEGUNDOS.min || duracion > SEGUNDOS.max) {
      return setError(`Los segundos por ronda tienen que ser entre ${SEGUNDOS.min} y ${SEGUNDOS.max}.`);
    }
    const cantidadEquipos = Number(cantidadDeEquipos);
    if (equipos !== "none" && (!Number.isInteger(cantidadEquipos) || cantidadEquipos < 2 || cantidadEquipos > 6)) {
      return setError("Los equipos tienen que ser entre 2 y 6.");
    }
    const conEquipos =
      equipos === "none"
        ? {}
        : { teamMode: equipos, teamCount: cantidadEquipos, teamNames: Array.from({ length: cantidadEquipos }, (_, i) => nombresDeEquipos[i] ?? "") };
    let opciones: Parameters<ApiBatallas["crear"]>[0];
    if (modoDeCanciones === "list") {
      if (lista.length === 0) return setError("Armá la lista con al menos una canción.");
      opciones = {
        segundos: duracion,
        titulo,
        audioMode,
        joinMode,
        ...conEquipos,
        modoDeCanciones: "list",
        lista: lista.map(({ song_id, source, youtube_id, start_seconds }) => ({ song_id, source, ...(source === "youtube" && { youtube_id, start_seconds }) })),
      };
    } else {
      const cantidadPedida = Number(rondas);
      if (!Number.isInteger(cantidadPedida) || cantidadPedida < RONDAS.min || cantidadPedida > RONDAS.max) {
        return setError(`Las canciones tienen que ser entre ${RONDAS.min} y ${RONDAS.max}.`);
      }
      if (hayFiltros(filtros) && cantidad !== null && cantidad < cantidadPedida) {
        return setError(`Con esos filtros no alcanzan las canciones: hay ${cantidad} y pediste ${cantidadPedida}. Ampliá la selección o pedí menos.`);
      }
      opciones = { rondas: cantidadPedida, segundos: duracion, titulo, audioMode, joinMode, ...conEquipos, ...(hayFiltros(filtros) && { filtros }) };
    }
    setError(null);
    setCreando(true);
    try {
      const sala = await cliente.crear(opciones);
      guardarHostToken(sala.code, sala.host_token);
      router.push(`/batalla/${sala.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos crear la sala. Probá de nuevo.");
      setCreando(false);
    }
  }

  const alAzar = modoDeCanciones === "random";

  return (
    <main className="batalla">
      {/* No es un <form>: el buscador de canciones trae el suyo, y un formulario dentro de otro mandaría la sala al agregar una canción. */}
      <div className="batalla__tarjeta batalla__tarjeta--ancha" role="group" aria-label="Crear una batalla">
        <h1 className="batalla__titulo">Creá una batalla</h1>
        <p className="batalla__bajada">
          Armás la sala, compartís el enlace y los demás juegan las mismas canciones al mismo tiempo. Vos organizás: no jugás.
        </p>
        <label className="batalla__campo">
          Título (opcional)
          <input value={titulo} maxLength={60} onChange={(e) => setTitulo(e.target.value)} placeholder="Cumple de Ana" />
        </label>

        <fieldset className="batalla__opciones">
          <legend>¿Qué canciones salen?</legend>
          <label>
            <input type="radio" name="canciones" checked={alAzar} onChange={() => setModoDeCanciones("random")} />
            Al azar (podés acotarlas y excluir)
          </label>
          <label>
            <input type="radio" name="canciones" checked={!alAzar} onChange={() => setModoDeCanciones("list")} />
            Elegir yo las canciones y su orden
          </label>
        </fieldset>

        {alAzar ? (
          <>
            <label className="batalla__campo">
              Canciones
              <input inputMode="numeric" value={rondas} onChange={(e) => setRondas(e.target.value)} />
            </label>
            <details className="batalla__detalle">
              <summary>Acotar las canciones (opcional)</summary>
              <FiltrosDelAzar
                valor={filtros}
                alCambiar={setFiltros}
                generos={generos}
                buscarArtistas={buscarArtistas}
                cantidad={cantidad}
                pedidas={Number(rondas) || RONDAS.porDefecto}
              />
            </details>
          </>
        ) : (
          <ListaElegida items={lista} alCambiar={setLista} canciones={canciones} leerYoutube={(url) => cliente.youtube(url)} maximo={RONDAS.max} />
        )}

        <label className="batalla__campo">
          Segundos por ronda
          <input inputMode="numeric" value={segundos} onChange={(e) => setSegundos(e.target.value)} />
        </label>
        <fieldset className="batalla__opciones">
          <legend>¿Dónde suena la música?</legend>
          <label>
            <input type="radio" name="audio" checked={audioMode === "each"} onChange={() => setAudioMode("each")} />
            En cada dispositivo
          </label>
          <label>
            <input type="radio" name="audio" checked={audioMode === "host"} onChange={() => setAudioMode("host")} />
            Solo en mi pantalla (yo pongo la música)
          </label>
        </fieldset>
        <fieldset className="batalla__opciones">
          <legend>¿Quién puede entrar?</legend>
          <label>
            <input type="radio" name="entrada" checked={joinMode === "open"} onChange={() => setJoinMode("open")} />
            Cualquiera con el enlace
          </label>
          <label>
            <input type="radio" name="entrada" checked={joinMode === "approval"} onChange={() => setJoinMode("approval")} />
            Aceptar a cada persona
          </label>
        </fieldset>
        <fieldset className="batalla__opciones">
          <legend>¿Jugar por equipos?</legend>
          <label>
            <input type="radio" name="equipos" checked={equipos === "none"} onChange={() => setEquipos("none")} />
            Sin equipos
          </label>
          <label>
            <input type="radio" name="equipos" checked={equipos === "random"} onChange={() => setEquipos("random")} />
            Equipos al azar (se arman al empezar)
          </label>
          <label>
            <input type="radio" name="equipos" checked={equipos === "manual"} onChange={() => setEquipos("manual")} />
            Armo yo los equipos
          </label>
          {equipos !== "none" && (
            <>
              <label className="batalla__campo">
                Cantidad de equipos
                <input inputMode="numeric" value={cantidadDeEquipos} onChange={(e) => setCantidadDeEquipos(e.target.value)} />
              </label>
              {Array.from({ length: Number.isInteger(Number(cantidadDeEquipos)) && Number(cantidadDeEquipos) >= 2 && Number(cantidadDeEquipos) <= 6 ? Number(cantidadDeEquipos) : 0 }, (_, i) => (
                <label key={i} className="batalla__campo">
                  Nombre del equipo {i + 1}
                  <input
                    value={nombresDeEquipos[i] ?? ""}
                    maxLength={50}
                    placeholder={`Equipo ${i + 1}`}
                    onChange={(e) => setNombresDeEquipos((previos) => Object.assign([...previos], { [i]: e.target.value }))}
                  />
                </label>
              ))}
            </>
          )}
        </fieldset>
        {error && (
          <p className="batalla__error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="boton boton--violeta" disabled={creando} onClick={enviar}>
          {creando ? "Creando…" : "Crear sala"}
        </button>
      </div>
    </main>
  );
}
