import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buscarEn } from "../lib/juego/prueba-buscar";
import { ApiError } from "../lib/juego/tipos";
import type { ApiBatallas } from "../lib/batallas/api-batallas";
import { guardarHostToken } from "../lib/batallas/api-batallas";
import type { CancionCatalogo } from "../lib/juego/tipos";
import { useSala } from "../lib/batallas/useSala";
import { Sala } from "./Sala";
import { T0, enRevelacion, enRonda, iso, sala, terminada, unible } from "./fixtures";

vi.mock("../lib/batallas/useSala", () => ({ useSala: vi.fn() }));
const youtube = vi.hoisted(() => ({
  opciones: null as null | { videoId: string; events: { onReady?: () => void; onError?: (e: { data: number }) => void } },
  jugador: { playVideo: vi.fn(), pauseVideo: vi.fn(), seekTo: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn().mockReturnValue(1) },
}));
vi.mock("../lib/batallas/youtube-iframe", () => ({
  cargarYoutube: () =>
    Promise.resolve({
      Player: function (_el: unknown, opciones: NonNullable<typeof youtube.opciones>) {
        youtube.opciones = opciones;
        return youtube.jugador;
      },
    }),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR") } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const refrescar = vi.fn();
const poner = (estado: Partial<ReturnType<typeof useSala>>, ahoraMs = T0 + 1000) =>
  vi.mocked(useSala).mockReturnValue({ sala: null, error: null, ahora: () => ahoraMs, refrescar, ...estado });

const CANCIONES: CancionCatalogo[] = [
  { id: 7, title: "Zafar", artist: "La Vela Puerca", album: "A contraluz", year: 2001, genre: "Rock" },
  { id: 8, title: "Chau", artist: "No Te Va Gustar", album: "Por lo menos hoy", year: 2007, genre: "Rock" },
];
const buscarCanciones = buscarEn(CANCIONES);
const apiCon = (metodos: Partial<Record<keyof ApiBatallas, ReturnType<typeof vi.fn>>>) => metodos as unknown as ApiBatallas;
const montar = (api: ApiBatallas = apiCon({})) => render(<Sala code="ABC234" api={api} buscarCanciones={buscarCanciones} />);

beforeEach(() => {
  youtube.opciones = null;
  youtube.jugador.playVideo.mockClear();
  window.localStorage.clear();
  refrescar.mockReset();
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
  window.HTMLMediaElement.prototype.load = vi.fn();
});
afterEach(cleanup);

describe("Sala: antes de entrar", () => {
  it("mientras carga dice que está cargando", () => {
    poner({});
    montar();
    expect(screen.getByText(/cargando la sala/i)).toBeInTheDocument();
  });

  it("si no existe (o es de otras personas) dice que no la encontró", () => {
    poner({ error: new ApiError("No encontrado.", 404) });
    montar();
    expect(screen.getByText(/no encontramos esta sala/i)).toBeInTheDocument();
  });

  it("si no hay conexión permite reintentar", () => {
    poner({ error: new ApiError("No se pudo conectar con el servidor.", 0) });
    montar();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(refrescar).toHaveBeenCalled();
  });

  it("una sala en su lobby pide el nombre y entra", async () => {
    poner({ sala: unible() });
    const unirse = vi.fn().mockResolvedValue({ player: { name: "Zoe" } });
    montar(apiCon({ unirse }));

    expect(screen.getByRole("heading", { name: /cumple/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/tu nombre/i), { target: { value: "Zoe" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar a la sala/i }));

    await waitFor(() => expect(refrescar).toHaveBeenCalled());
    expect(unirse).toHaveBeenCalledWith("ABC234", "Zoe", undefined);
  });

  it("muestra el error de la API al unirse (nombre repetido)", async () => {
    poner({ sala: unible() });
    const unirse = vi.fn().mockRejectedValue(new ApiError("Ese nombre ya está en la sala. Elegí otro.", 400));
    montar(apiCon({ unirse }));

    fireEvent.change(screen.getByLabelText(/tu nombre/i), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar a la sala/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Elegí otro");
    expect(refrescar).not.toHaveBeenCalled();
  });
});

describe("Sala: lobby", () => {
  it("muestra el enlace, el QR y quiénes entraron", async () => {
    poner({ sala: sala() });
    montar();

    expect(screen.getByDisplayValue(/\/batalla\/ABC234$/)).toBeInTheDocument();
    expect(await screen.findByAltText(/código qr/i)).toHaveAttribute("src", "data:image/png;base64,QR");
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
    expect(screen.getByText(/esperando que empiece/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /empezar/i })).toBeNull();
  });

  it("quien organiza ve Empezar, deshabilitado con menos de 2 jugadores", () => {
    poner({ sala: sala({ role: "host", players: [{ name: "Ana", answered: false }] }) });
    montar();

    expect(screen.getByText(/quien organiza no juega/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /empezar/i })).toBeDisabled();
  });

  it("si el servidor deja jugar de a uno, con 1 jugador ya se puede empezar", () => {
    poner({ sala: sala({ role: "host", min_players: 1, players: [{ name: "Ana", answered: false }] }) });
    montar();

    expect(screen.getByRole("button", { name: /empezar/i })).toBeEnabled();
    expect(screen.queryByText(/al menos otra persona/i)).toBeNull();
  });

  it("sin nadie en la sala no se puede empezar aunque alcance con uno", () => {
    poner({ sala: sala({ role: "host", min_players: 1, players: [] }) });
    montar();

    expect(screen.getByRole("button", { name: /empezar/i })).toBeDisabled();
    expect(screen.getByText(/que entre alguien/i)).toBeInTheDocument();
  });

  it("con 2 jugadores el organizador empieza con su clave", async () => {
    guardarHostToken("ABC234", "secreto");
    poner({ sala: sala({ role: "host" }) });
    const empezar = vi.fn().mockResolvedValue({ status: "playing" });
    montar(apiCon({ empezar }));

    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));

    await waitFor(() => expect(refrescar).toHaveBeenCalled());
    expect(empezar).toHaveBeenCalledWith("ABC234", "secreto");
  });

  it("si no se puede empezar muestra el motivo", async () => {
    poner({ sala: sala({ role: "host" }) });
    montar(apiCon({ empezar: vi.fn().mockRejectedValue(new ApiError("No pudimos armar las canciones. Probá de nuevo.", 400)) }));

    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos armar las canciones");
  });
});

describe("Sala: ronda", () => {
  it("antes de que empiece la ronda cuenta hacia atrás", () => {
    poner({ sala: enRonda({ phase: { name: "countdown", index: 0 } }) }, T0 + 2000);
    montar();
    expect(screen.getByText("3")).toBeInTheDocument(); // starts_at es +5 s y ahora +2 s
  });

  it("al abrirse la ronda suena el audio y se puede buscar la canción", async () => {
    poner({ sala: enRonda() }, T0 + 6000);
    montar();

    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("si el navegador no deja sonar solo, pide un toque", async () => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError")).mockResolvedValue(undefined);
    poner({ sala: enRonda() }, T0 + 6000);
    montar();

    const boton = await screen.findByRole("button", { name: /tocá para escuchar/i });
    fireEvent.click(boton);
    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  });

  it("responde una sola vez y no dice si acertó", async () => {
    poner({ sala: enRonda() }, T0 + 6000);
    const responder = vi.fn().mockResolvedValue({ received: true });
    montar(apiCon({ responder }));

    const campo = await screen.findByRole("combobox");
    fireEvent.change(campo, { target: { value: "zafar" } });
    fireEvent.click(await screen.findByRole("option", { name: /zafar/i }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar intento" }));

    await waitFor(() => expect(responder).toHaveBeenCalledWith("ABC234", 7));
    expect(await screen.findByText(/respuesta enviada/i)).toBeInTheDocument();
    expect(screen.queryByText(/correcto|acertaste|incorrecto/i)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(responder).toHaveBeenCalledTimes(1);
  });

  it("si ya respondió en esta ronda no muestra el buscador", async () => {
    poner({ sala: enRonda({ round: { index: 0, starts_at: new Date(T0 + 5000).toISOString(), ends_at: new Date(T0 + 15000).toISOString(), preview_url: "x", answered: true } }) }, T0 + 6000);
    montar();
    expect(await screen.findByText(/respuesta enviada/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("quien organiza no oye ni busca: ve cuántos respondieron", () => {
    poner({ sala: enRonda({ role: "host", players: [{ name: "Ana", answered: true }, { name: "Beto", answered: false }] }) }, T0 + 6000);
    montar();

    expect(screen.getByText(/respondieron 1 de 2/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});

describe("Sala: resultados", () => {
  it("entre rondas muestra la canción correcta, tu puntaje y el ranking parcial", () => {
    poner({ sala: enRevelacion() });
    montar();

    expect(screen.getByText("Zafar", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/La Vela Puerca/)).toBeInTheDocument();
    expect(screen.getByText(/\+130/)).toBeInTheDocument();
    const tabla = screen.getByRole("table");
    expect(within(tabla).getAllByRole("row")).toHaveLength(3); // encabezado + 2 jugadores
  });

  it("si no respondió lo dice", () => {
    poner({ sala: enRevelacion({ reveal: { song: { id: 7, title: "Zafar", artist: "LVP", album: "A", year: 2001, genre: "Rock" }, my_answer: null } }) });
    montar();
    expect(screen.getByText(/no respondiste/i)).toBeInTheDocument();
  });

  it("al terminar muestra el ranking final y los caminos de salida", () => {
    poner({ sala: terminada() });
    montar();

    expect(screen.getByRole("heading", { name: /resultados/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mis batallas/i })).toHaveAttribute("href", "/ranking?vista=batallas");
    expect(screen.getByRole("link", { name: /crear otra batalla/i })).toHaveAttribute("href", "/batalla");
  });
});

describe("Sala: aceptar participantes", () => {
  it("quien espera ve que lo tienen que aceptar y no ve la sala", () => {
    poner({ sala: sala({ my_status: "pending", players: [] }) });
    montar();
    expect(screen.getByText(/esperando que te acepten/i)).toBeInTheDocument();
    expect(screen.queryByText(/en la sala/i)).toBeNull();
  });

  it("a quien rechazaron se lo dice", () => {
    poner({ sala: sala({ my_status: "rejected", players: [] }) });
    montar();
    expect(screen.getByText(/no te aceptaron/i)).toBeInTheDocument();
  });

  it("quien organiza ve a los que esperan y los acepta o rechaza", async () => {
    guardarHostToken("ABC234", "secreto");
    poner({ sala: sala({ role: "host", join_mode: "approval", players: [{ id: 1, name: "Ana" }], pending: [{ id: 2, name: "Beto" }] }) });
    const revisar = vi.fn().mockResolvedValue({ ok: true });
    montar(apiCon({ revisar }));

    expect(screen.getByText(/esperan que los aceptes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /aceptar a beto/i }));
    await waitFor(() => expect(revisar).toHaveBeenCalledWith("ABC234", 2, true, "secreto"));
    fireEvent.click(screen.getByRole("button", { name: /rechazar a beto/i }));
    await waitFor(() => expect(revisar).toHaveBeenCalledWith("ABC234", 2, false, "secreto"));
    expect(refrescar).toHaveBeenCalled();
  });

  it("quien organiza puede sacar a alguien que ya entró", async () => {
    poner({ sala: sala({ role: "host", players: [{ id: 1, name: "Ana" }] }) });
    const revisar = vi.fn().mockResolvedValue({ ok: true });
    montar(apiCon({ revisar }));

    fireEvent.click(screen.getByRole("button", { name: /sacar a ana/i }));
    await waitFor(() => expect(revisar).toHaveBeenCalledWith("ABC234", 1, false, undefined));
  });

  it("al entrar a una sala con aprobación avisa que hay que esperar", () => {
    poner({ sala: { ...unible(), join_mode: "approval" } });
    montar();
    expect(screen.getByText(/quien organiza tiene que aceptarte/i)).toBeInTheDocument();
  });
});

describe("Sala: el anfitrión pone la música", () => {
  it("en modo anfitrión el jugador no oye nada en su dispositivo: escucha en la pantalla del anfitrión y busca", async () => {
    poner({ sala: enRonda({ audio_mode: "host", round: { index: 0, starts_at: iso(5), ends_at: iso(15), answered: false } }) }, T0 + 6000);
    montar();

    expect(await screen.findByText(/en la pantalla del anfitrión/i)).toBeInTheDocument();
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /tocá para escuchar/i })).toBeNull();
  });

  it("en modo anfitrión suena en la pantalla de quien organiza", async () => {
    poner({ sala: enRonda({ role: "host", audio_mode: "host", players: [{ id: 1, name: "Ana", answered: false }], round: { index: 0, starts_at: iso(5), ends_at: iso(15), preview_url: "https://cdn/x.mp3" } }) }, T0 + 6000);
    montar();

    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(screen.getByText(/está sonando/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("el toque en Empezar desbloquea el audio del anfitrión", async () => {
    poner({ sala: sala({ role: "host", audio_mode: "host" }) });
    montar(apiCon({ empezar: vi.fn().mockResolvedValue({ status: "playing" }) }));

    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("el toque en Entrar a la sala desbloquea el audio del jugador", async () => {
    poner({ sala: unible() });
    montar(apiCon({ unirse: vi.fn().mockResolvedValue({ player: { name: "Zoe", status: "accepted" } }) }));

    fireEvent.change(screen.getByLabelText(/tu nombre/i), { target: { value: "Zoe" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar a la sala/i }));
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});

describe("Sala: rondas con un video de YouTube", () => {
  const rondaDeYoutube = (extra: Record<string, unknown> = {}) => ({
    index: 0,
    starts_at: iso(5),
    ends_at: iso(15),
    preview_url: "https://cdn/reserva.mp3",
    source: "youtube" as const,
    youtube_id: "dQw4w9WgXcQ",
    start_seconds: 12,
    answered: false,
    ...extra,
  });

  it("el jugador oye el video en el reproductor de YouTube y no con el audio de Deezer", async () => {
    poner({ sala: enRonda({ round: rondaDeYoutube() }) }, T0 + 6000);
    montar();

    await waitFor(() => expect(youtube.opciones?.videoId).toBe("dQw4w9WgXcQ"));
    await act(async () => youtube.opciones!.events.onReady!());
    expect(youtube.jugador.playVideo).toHaveBeenCalled();
    expect(window.HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("si el video no se puede reproducir, suena el preview de Deezer de reserva", async () => {
    poner({ sala: enRonda({ round: rondaDeYoutube() }) }, T0 + 6000);
    montar();

    await waitFor(() => expect(youtube.opciones).not.toBeNull());
    await act(async () => youtube.opciones!.events.onError!({ data: 150 }));

    await waitFor(() => expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(screen.getByText(/video no se pudo reproducir/i)).toBeInTheDocument();
  });

  it("en modo anfitrión el video lo pone la pantalla de quien organiza y no la de los jugadores", async () => {
    poner({ sala: enRonda({ audio_mode: "host", round: rondaDeYoutube({ preview_url: undefined, source: undefined, youtube_id: undefined, start_seconds: undefined }) }) }, T0 + 6000);
    montar();

    expect(await screen.findByText(/en la pantalla del anfitrión/i)).toBeInTheDocument();
    expect(youtube.opciones).toBeNull();
  });

  it("en modo anfitrión quien organiza ve el reproductor", async () => {
    poner({ sala: enRonda({ role: "host", audio_mode: "host", players: [{ id: 1, name: "Ana", answered: false }], round: rondaDeYoutube() }) }, T0 + 6000);
    montar();

    await waitFor(() => expect(youtube.opciones?.videoId).toBe("dQw4w9WgXcQ"));
    expect(screen.getByText(/está sonando/i)).toBeInTheDocument();
  });
});

describe("Sala: equipos", () => {
  const EQUIPOS = [
    { id: 11, name: "Rojos", color: "#e8508a" },
    { id: 12, name: "Azules", color: "#3aa0e8" },
  ];

  it("quien organiza arma los equipos a mano desde el lobby", async () => {
    guardarHostToken("ABC234", "secreto");
    poner({
      sala: sala({ role: "host", team_mode: "manual", teams: EQUIPOS, players: [{ id: 1, name: "Ana", team: null }, { id: 2, name: "Beto", team: 11 }] }),
    });
    const asignarEquipo = vi.fn().mockResolvedValue({ ok: true });
    montar(apiCon({ asignarEquipo }));

    fireEvent.change(screen.getByLabelText("Equipo de Ana"), { target: { value: "12" } });
    await waitFor(() => expect(asignarEquipo).toHaveBeenCalledWith("ABC234", 1, 12, "secreto"));
    fireEvent.change(screen.getByLabelText("Equipo de Beto"), { target: { value: "" } });
    await waitFor(() => expect(asignarEquipo).toHaveBeenCalledWith("ABC234", 2, null, "secreto"));
    expect(refrescar).toHaveBeenCalled();
  });

  it("en equipos al azar quien organiza no asigna: se avisa que se arman al empezar", () => {
    poner({ sala: sala({ role: "host", team_mode: "random", teams: EQUIPOS, players: [{ id: 1, name: "Ana", team: null }] }) });
    montar();
    expect(screen.queryByLabelText("Equipo de Ana")).toBeNull();
    expect(screen.getByText(/equipos se arman al azar/i)).toBeInTheDocument();
  });

  it("los jugadores ven en qué equipo está cada uno y cuál es el suyo", () => {
    poner({ sala: sala({ team_mode: "manual", teams: EQUIPOS, my_team: 11, players: [{ name: "Ana", team: 11 }, { name: "Beto", team: 12 }, { name: "Caro", team: null }] }) });
    montar();

    expect(screen.getByText(/tu equipo: rojos/i)).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: /jugadores/i });
    expect(within(lista).getByText("Ana").closest("li")).toHaveTextContent("Rojos");
    expect(within(lista).getByText("Beto").closest("li")).toHaveTextContent("Azules");
    expect(within(lista).getByText("Caro").closest("li")).not.toHaveTextContent(/rojos|azules/i);
  });

  it("durante la ronda el jugador ve su equipo", async () => {
    poner({ sala: enRonda({ team_mode: "random", teams: EQUIPOS, my_team: 12 }) }, T0 + 6000);
    montar();
    expect(await screen.findByText(/tu equipo: azules/i)).toBeInTheDocument();
  });

  it("entre rondas y al final se ve el ranking por equipos, con el promedio de puntos", () => {
    poner({
      sala: enRevelacion({
        team_mode: "random",
        teams: EQUIPOS,
        my_team: 11,
        team_ranking: [
          { position: 1, id: 12, name: "Azules", color: "#3aa0e8", members: 2, points: 100, total: 200, correct: 2 },
          { position: 2, id: 11, name: "Rojos", color: "#e8508a", members: 2, points: 75, total: 150, correct: 1 },
        ],
      }),
    });
    montar();

    const tabla = screen.getByRole("table", { name: /equipos/i });
    const filas = within(tabla).getAllByRole("row");
    expect(filas).toHaveLength(3);
    expect(filas[1]).toHaveTextContent("Azules");
    expect(filas[1]).toHaveTextContent("100");
    expect(filas[2]).toHaveTextContent("Rojos");
    expect(screen.getByRole("table", { name: /jugadores/i })).toBeInTheDocument(); // y debajo, las personas
  });

  it("sin equipos no hay tabla de equipos", () => {
    poner({ sala: enRevelacion() });
    montar();
    expect(screen.queryByRole("table", { name: /equipos/i })).toBeNull();
  });
});

describe("Sala: modo presentación y datos para proyectar", () => {
  const STATS = {
    total: 5,
    answered: 4,
    correct: 3,
    fastest: { name: "Ana", seconds: 3.2 },
    top_guesses: [
      { title: "Zafar", artist: "La Vela Puerca", count: 3, correct: true },
      { title: "Chau", artist: "No Te Va Gustar", count: 1, correct: false },
    ],
  };

  beforeEach(() => {
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = vi.fn().mockResolvedValue(undefined);
  });

  it.each([
    ["el lobby", () => sala({ role: "host" })],
    ["la ronda", () => enRonda({ role: "host", players: [{ id: 1, name: "Ana", answered: false }] })],
    ["los resultados", () => enRevelacion({ role: "host" })],
  ])("quien organiza tiene el botón de modo presentación en %s", (_nombre, hacer) => {
    poner({ sala: hacer() }, T0 + 6000);
    montar();
    expect(screen.getByRole("button", { name: /modo presentación/i })).toBeInTheDocument();
  });

  it("los jugadores no lo tienen", () => {
    poner({ sala: sala() });
    montar();
    expect(screen.queryByRole("button", { name: /modo presentación/i })).toBeNull();
  });

  it("al activarlo la pantalla pasa a pantalla completa y se puede salir", async () => {
    poner({ sala: sala({ role: "host" }) });
    montar();

    fireEvent.click(screen.getByRole("button", { name: /modo presentación/i }));
    const pantalla = screen.getByRole("dialog", { name: /pantalla de presentación/i });
    expect(pantalla).toBeInTheDocument();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    expect(within(pantalla).getByText("En la sala (2)")).toBeInTheDocument(); // el mismo contenido, en grande

    fireEvent.click(screen.getByRole("button", { name: /salir de la presentación/i }));
    expect(screen.queryByRole("dialog", { name: /pantalla de presentación/i })).toBeNull();
  });

  it("si el navegador no deja pantalla completa, igual funciona", () => {
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error("no"));
    poner({ sala: sala({ role: "host" }) });
    montar();
    fireEvent.click(screen.getByRole("button", { name: /modo presentación/i }));
    expect(screen.getByRole("dialog", { name: /pantalla de presentación/i })).toBeInTheDocument();
  });

  it("quien organiza ve cómo respondió la sala entre rondas", () => {
    poner({ sala: enRevelacion({ role: "host", stats: STATS }) });
    montar();

    const datos = within(screen.getByRole("region", { name: /datos de la ronda/i }));
    expect(datos.getByText(/respondieron 4 de 5/i)).toBeInTheDocument();
    expect(datos.getByText(/acertaron 3 \(60 ?%\)/i)).toBeInTheDocument();
    expect(datos.getByText(/la más rápida: ana \(3,2 s\)/i)).toBeInTheDocument();
    expect(datos.getByText(/zafar/i)).toBeInTheDocument();
    expect(datos.getByText(/3 votos/i)).toBeInTheDocument();
  });

  it("sin nadie que haya acertado no hay 'la más rápida'", () => {
    poner({ sala: enRevelacion({ role: "host", stats: { ...STATS, correct: 0, fastest: null } }) });
    montar();
    expect(screen.queryByText(/la más rápida/i)).toBeNull();
    expect(screen.getByText(/acertaron 0 \(0 ?%\)/i)).toBeInTheDocument();
  });

  it("los jugadores no ven esos datos", () => {
    poner({ sala: enRevelacion() });
    montar();
    expect(screen.queryByRole("region", { name: /datos de la ronda/i })).toBeNull();
  });

  it("al terminar hay un podio con los tres primeros", () => {
    poner({
      sala: terminada({
        ranking: [
          { position: 1, name: "Ana", points: 250, correct: 2 },
          { position: 2, name: "Beto", points: 130, correct: 1 },
          { position: 3, name: "Caro", points: 90, correct: 1 },
          { position: 4, name: "Dani", points: 0, correct: 0 },
        ],
      }),
    });
    montar();

    const podio = within(screen.getByRole("list", { name: /podio de jugadores/i }));
    const filas = podio.getAllByRole("listitem");
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveTextContent("Ana");
    expect(filas[0]).toHaveTextContent("250");
    expect(filas[2]).toHaveTextContent("Caro");
    expect(within(screen.getByRole("list", { name: /podio de jugadores/i })).queryByText("Dani")).toBeNull();
  });

  it("con equipos el podio también muestra los equipos", () => {
    poner({
      sala: terminada({
        team_mode: "random",
        teams: [{ id: 1, name: "Rojos", color: "#e8508a" }, { id: 2, name: "Azules", color: "#3aa0e8" }],
        team_ranking: [
          { position: 1, id: 2, name: "Azules", color: "#3aa0e8", members: 2, points: 100, total: 200, correct: 2 },
          { position: 2, id: 1, name: "Rojos", color: "#e8508a", members: 2, points: 75, total: 150, correct: 1 },
        ],
      }),
    });
    montar();
    const podio = within(screen.getByRole("list", { name: /podio de equipos/i }));
    expect(podio.getAllByRole("listitem")[0]).toHaveTextContent("Azules");
  });

  it("entre rondas no hay podio", () => {
    poner({ sala: enRevelacion() });
    montar();
    expect(screen.queryByRole("list", { name: /podio/i })).toBeNull();
  });
});
