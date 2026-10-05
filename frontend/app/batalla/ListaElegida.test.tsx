import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type CancionCatalogo } from "../lib/juego/tipos";
import { ListaElegida, type ItemConDatos } from "./ListaElegida";

afterEach(cleanup);

const CANCIONES: CancionCatalogo[] = [
  { id: 1, title: "Zafar", artist: "La Vela Puerca", album: "A contraluz", year: 2001, genre: "Rock" },
  { id: 2, title: "Chau", artist: "No Te Va Gustar", album: "Por lo menos hoy", year: 2007, genre: "Rock" },
  { id: 3, title: "Candombe para Gardel", artist: "Rubén Rada", album: "Candombe", year: 1985, genre: "Candombe" },
];

/** Un reproductor de YouTube de mentira que dispara el error indicado apenas se crea (o ninguno). */
function videoQue(codigoDeError?: number) {
  return () =>
    Promise.resolve({
      Player: function (_el: unknown, opciones: { events: { onReady?: () => void; onError?: (e: { data: number }) => void } }) {
        queueMicrotask(() => (codigoDeError ? opciones.events.onError?.({ data: codigoDeError }) : opciones.events.onReady?.()));
        return { playVideo: vi.fn(), pauseVideo: vi.fn(), seekTo: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn() };
      },
    } as never);
}

function montar(extra: { inicial?: ItemConDatos[]; maximo?: number; leerYoutube?: ReturnType<typeof vi.fn>; cargarVideo?: () => Promise<never> } = {}) {
  const ultimo = { valor: extra.inicial ?? ([] as ItemConDatos[]) };
  const leerYoutube = extra.leerYoutube ?? vi.fn();
  function Contenedor() {
    const [items, setItems] = useState<ItemConDatos[]>(extra.inicial ?? []);
    ultimo.valor = items;
    return <ListaElegida items={items} alCambiar={setItems} canciones={CANCIONES} leerYoutube={leerYoutube} cargarVideo={extra.cargarVideo ?? videoQue()} maximo={extra.maximo ?? 30} />;
  }
  render(<Contenedor />);
  return { ultimo, leerYoutube };
}

const catalogo = () => within(screen.getByRole("region", { name: /agregar del catálogo/i }));
const youtube = () => within(screen.getByRole("region", { name: /agregar un enlace de youtube/i }));

function agregarDelCatalogo(titulo: string, busqueda: string) {
  fireEvent.change(catalogo().getByRole("combobox"), { target: { value: busqueda } });
  fireEvent.click(catalogo().getByRole("option", { name: new RegExp(titulo, "i") }));
  fireEvent.click(catalogo().getByRole("button", { name: /agregar a la lista/i }));
}

const item = (id: number, titulo: string, extra: Partial<ItemConDatos> = {}): ItemConDatos => ({ song_id: id, source: "deezer", titulo, artista: "X", ...extra });

describe("ListaElegida", () => {
  it("agrega canciones del catálogo, en el orden en que se eligen", () => {
    const { ultimo } = montar();

    agregarDelCatalogo("Chau", "chau");
    agregarDelCatalogo("Zafar", "zafar");

    expect(ultimo.valor.map((i) => [i.song_id, i.source])).toEqual([[2, "deezer"], [1, "deezer"]]);
    const filas = screen.getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Chau");
    expect(filas[1]).toHaveTextContent("Zafar");
    expect(screen.getByText(/2 canciones en la lista/i)).toBeInTheDocument();
  });

  it("no deja repetir una canción", () => {
    const { ultimo } = montar({ inicial: [item(1, "Zafar")] });
    agregarDelCatalogo("Zafar", "zafar");
    expect(ultimo.valor).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/ya está en la lista/i);
  });

  it("sube, baja y quita", () => {
    const { ultimo } = montar({ inicial: [item(1, "Zafar"), item(2, "Chau"), item(3, "Candombe")] });

    fireEvent.click(screen.getByRole("button", { name: "Subir Candombe" }));
    expect(ultimo.valor.map((i) => i.song_id)).toEqual([1, 3, 2]);
    fireEvent.click(screen.getByRole("button", { name: "Bajar Zafar" }));
    expect(ultimo.valor.map((i) => i.song_id)).toEqual([3, 1, 2]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Chau" }));
    expect(ultimo.valor.map((i) => i.song_id)).toEqual([3, 1]);
  });

  it("el primero no se puede subir ni el último bajar", () => {
    montar({ inicial: [item(1, "Zafar"), item(2, "Chau")] });
    expect(screen.getByRole("button", { name: "Subir Zafar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Chau" })).toBeDisabled();
  });

  it("no pasa del máximo", () => {
    const { ultimo } = montar({ inicial: [item(1, "Zafar")], maximo: 1 });
    expect(screen.getByText(/llegaste al máximo de 1 canciones/i)).toBeInTheDocument();
    expect(ultimo.valor).toHaveLength(1);
  });

  it("lee un enlace de YouTube y propone las canciones que podría ser", async () => {
    const leerYoutube = vi.fn().mockResolvedValue({ youtube_id: "dQw4w9WgXcQ", title: "La Vela Puerca - Zafar (Official Video)", author: "LVP", suggestions: [CANCIONES[0]] });
    const { ultimo } = montar({ leerYoutube });

    fireEvent.change(youtube().getByLabelText(/enlace de youtube/i), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.click(youtube().getByRole("button", { name: /leer enlace/i }));

    expect(await youtube().findByText(/la vela puerca - zafar \(official video\)/i)).toBeInTheDocument();
    fireEvent.change(youtube().getByLabelText(/empezar en el segundo/i), { target: { value: "12" } });
    fireEvent.click(youtube().getByRole("button", { name: /es zafar de la vela puerca/i }));

    expect(leerYoutube).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ");
    expect(ultimo.valor).toEqual([expect.objectContaining({ song_id: 1, source: "youtube", youtube_id: "dQw4w9WgXcQ", start_seconds: 12 })]);
    expect(screen.getByRole("listitem")).toHaveTextContent(/youtube.*0:12/i);
  });

  it("si el enlace no coincide con nada, se elige la canción a mano", async () => {
    const leerYoutube = vi.fn().mockResolvedValue({ youtube_id: "dQw4w9WgXcQ", title: "Algo raro", author: "X", suggestions: [] });
    const { ultimo } = montar({ leerYoutube });

    fireEvent.change(youtube().getByLabelText(/enlace de youtube/i), { target: { value: "dQw4w9WgXcQ" } });
    fireEvent.click(youtube().getByRole("button", { name: /leer enlace/i }));
    await youtube().findByText(/elegí qué canción es/i);

    fireEvent.change(youtube().getByRole("combobox"), { target: { value: "chau" } });
    fireEvent.click(youtube().getByRole("option", { name: /chau/i }));
    fireEvent.click(youtube().getByRole("button", { name: /usar esta canción/i }));

    expect(ultimo.valor).toEqual([expect.objectContaining({ song_id: 2, source: "youtube", youtube_id: "dQw4w9WgXcQ", start_seconds: 0 })]);
  });

  it("muestra por qué no sirve un enlace", async () => {
    const leerYoutube = vi.fn().mockRejectedValue(new ApiError("Ese video no permite reproducirse fuera de YouTube. Probá con otro.", 400));
    montar({ leerYoutube });

    fireEvent.change(youtube().getByLabelText(/enlace de youtube/i), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.click(youtube().getByRole("button", { name: /leer enlace/i }));

    expect(await youtube().findByRole("alert")).toHaveTextContent("fuera de YouTube");
  });

  it("no lee un enlace vacío", () => {
    const { leerYoutube } = montar();
    fireEvent.click(youtube().getByRole("button", { name: /leer enlace/i }));
    expect(leerYoutube).not.toHaveBeenCalled();
  });

  it("una canción de YouTube que ya está en la lista no se repite", async () => {
    const leerYoutube = vi.fn().mockResolvedValue({ youtube_id: "dQw4w9WgXcQ", title: "t", author: "a", suggestions: [CANCIONES[0]] });
    const { ultimo } = montar({ inicial: [item(1, "Zafar")], leerYoutube });

    fireEvent.change(youtube().getByLabelText(/enlace de youtube/i), { target: { value: "dQw4w9WgXcQ" } });
    fireEvent.click(youtube().getByRole("button", { name: /leer enlace/i }));
    fireEvent.click(await youtube().findByRole("button", { name: /es zafar de la vela puerca/i }));

    await waitFor(() => expect(youtube().getByRole("alert")).toHaveTextContent(/ya está en la lista/i));
    expect(ultimo.valor).toHaveLength(1);
  });

  it("al leer el enlace prueba el video: si se puede reproducir, no avisa nada", async () => {
    const leerYoutube = vi.fn().mockResolvedValue({ youtube_id: "dQw4w9WgXcQ", title: "t", author: "a", suggestions: [CANCIONES[0]] });
    montar({ leerYoutube, cargarVideo: videoQue() });

    fireEvent.change(youtube().getByLabelText(/enlace de youtube/i), { target: { value: "dQw4w9WgXcQ" } });
    fireEvent.click(youtube().getByRole("button", { name: /leer enlace/i }));
    await youtube().findByRole("button", { name: /es zafar de la vela puerca/i });

    expect(youtube().queryByText(/no se puede reproducir/i)).toBeNull();
  });

  it("si el dueño no deja embeber el video, avisa y esa canción queda con el preview de Deezer", async () => {
    const leerYoutube = vi.fn().mockResolvedValue({ youtube_id: "ss05HQ-kG44", title: "La Vela Puerca | Zafar", author: "a", suggestions: [CANCIONES[0]] });
    const { ultimo } = montar({ leerYoutube, cargarVideo: videoQue(150) });

    fireEvent.change(youtube().getByLabelText(/enlace de youtube/i), { target: { value: "ss05HQ-kG44" } });
    fireEvent.click(youtube().getByRole("button", { name: /leer enlace/i }));
    expect(await youtube().findByText(/este video no se puede reproducir/i)).toBeInTheDocument();

    fireEvent.click(youtube().getByRole("button", { name: /es zafar de la vela puerca/i }));
    expect(ultimo.valor).toEqual([expect.objectContaining({ song_id: 1, source: "deezer" })]);
    expect(ultimo.valor[0]).not.toHaveProperty("youtube_id");
  });
});
