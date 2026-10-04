import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PantallaFinal } from "./PantallaFinal";
import type { EstadoTerminado } from "../lib/juego/tipos";

afterEach(cleanup);

const terminado = (extra: Partial<EstadoTerminado> = {}): EstadoTerminado => ({
  finished: true,
  day: "2026-10-03",
  won: true,
  score_submitted: false,
  song: { title: "A las nueve", artist: "No Te Va Gustar", album: "El camino más largo" },
  ...extra,
});

function montar(estado: EstadoTerminado, extra: Partial<Parameters<typeof PantallaFinal>[0]> = {}) {
  const alGuardar = vi.fn().mockResolvedValue(undefined);
  render(<PantallaFinal estado={estado} intentosUsados={3} segundosParaProxima={45368} alGuardarPuntaje={alGuardar} {...extra} />);
  return { alGuardar };
}

describe("PantallaFinal cuando se ganó", () => {
  it("felicita, revela la canción y dice en cuántos intentos salió", () => {
    montar(terminado());

    expect(screen.getByRole("heading", { name: "¡La sacaste!" })).toBeInTheDocument();
    expect(screen.getByText("A las nueve")).toBeInTheDocument();
    expect(screen.getByText("No Te Va Gustar")).toBeInTheDocument();
    expect(screen.getByText("El camino más largo")).toBeInTheDocument();
    expect(screen.getByText(/en 3 intentos/)).toBeInTheDocument();
  });

  it("escribe en singular si salió al primer intento", () => {
    montar(terminado(), { intentosUsados: 1 });

    expect(screen.getByText(/en 1 intento\b/)).toBeInTheDocument();
  });

  it("prefiere el intento ganador que informa el backend", () => {
    montar(terminado({ score_submitted: true, winning_attempt: 2, score: 130 }), { intentosUsados: 5 });

    expect(screen.getByText(/en 2 intentos/)).toBeInTheDocument();
  });

  it("muestra la cuenta atrás hasta la próxima canción", () => {
    montar(terminado());

    expect(screen.getByText("12:36:08")).toBeInTheDocument();
  });
});

describe("PantallaFinal: presentación", () => {
  it("dice que la canción revelada es la de hoy, tanto si se ganó como si se perdió", () => {
    for (const won of [true, false]) {
      montar(terminado({ won }));
      expect(screen.getByText("La canción de hoy era")).toBeInTheDocument();
      cleanup();
    }
  });

  it("festeja con una ilustración decorativa solo cuando se ganó", () => {
    const { container, unmount } = render(
      <PantallaFinal estado={terminado()} intentosUsados={3} segundosParaProxima={10} alGuardarPuntaje={vi.fn()} />,
    );
    expect(container.querySelector("img.final__festejo")).toHaveAttribute("alt", "");
    unmount();

    const perdida = render(
      <PantallaFinal estado={terminado({ won: false })} intentosUsados={6} segundosParaProxima={10} alGuardarPuntaje={vi.fn()} />,
    );
    expect(perdida.container.querySelector("img.final__festejo")).toBeNull();
  });
});

describe("PantallaFinal: compartir", () => {
  const compartir = { filas: ["caee", "aaaa"], intentos: 2, numero: 138 };

  it("ofrece compartir el resultado como imagen, ganando o perdiendo", () => {
    for (const won of [true, false]) {
      montar(terminado({ won }), { compartir });
      expect(screen.getByRole("button", { name: "Compartir resultado" })).toBeInTheDocument();
      cleanup();
    }
  });

  it("aclara que la canción se puede mostrar al otro día, desde el historial", () => {
    montar(terminado(), { compartir });

    expect(screen.getByText(/mostrando la canción desde tu historial/)).toBeInTheDocument();
  });

  it("no ofrece compartir si no hay colores de los intentos para dibujar", () => {
    montar(terminado());

    expect(screen.queryByRole("button", { name: "Compartir resultado" })).toBeNull();
  });
});

describe("guardar el puntaje", () => {
  it("pide un nombre mientras el puntaje no se envió", () => {
    montar(terminado());

    expect(screen.getByLabelText("Tu nombre para el ranking")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar mi puntaje" })).toBeInTheDocument();
  });

  it("no envía un nombre vacío y lo explica", async () => {
    const { alGuardar } = montar(terminado());

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar mi puntaje" })));

    expect(screen.getByRole("alert")).toHaveTextContent("Escribí un nombre de hasta 50 caracteres");
    expect(alGuardar).not.toHaveBeenCalled();
  });

  it("envía el nombre sin espacios sobrantes", async () => {
    const { alGuardar } = montar(terminado());

    fireEvent.change(screen.getByLabelText("Tu nombre para el ranking"), { target: { value: "  brandon " } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar mi puntaje" })));

    expect(alGuardar).toHaveBeenCalledWith("brandon");
  });

  it("muestra el mensaje del backend si no se pudo guardar", async () => {
    const { alGuardar } = montar(terminado());
    alGuardar.mockRejectedValueOnce(new Error("Nombre inválido."));

    fireEvent.change(screen.getByLabelText("Tu nombre para el ranking"), { target: { value: "x" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar mi puntaje" })));

    expect(screen.getByRole("alert")).toHaveTextContent("Nombre inválido.");
    expect(screen.getByRole("button", { name: "Guardar mi puntaje" })).toBeEnabled();
  });

  it("bloquea el botón mientras guarda", async () => {
    let terminar!: () => void;
    const alGuardar = vi.fn(() => new Promise<void>((resolver) => (terminar = resolver)));
    montar(terminado(), { alGuardarPuntaje: alGuardar });

    fireEvent.change(screen.getByLabelText("Tu nombre para el ranking"), { target: { value: "brandon" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar mi puntaje" })));

    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    await act(async () => terminar());
  });

  it("cuando ya se guardó muestra los puntos y no vuelve a pedir el nombre", () => {
    montar(terminado({ score_submitted: true, winning_attempt: 3, score: 120 }));

    expect(screen.getByText(/120 puntos/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Tu nombre para el ranking")).toBeNull();
  });
});

describe("PantallaFinal cuando se perdió", () => {
  it("avisa con tono amable, revela la canción y no pide nombre", () => {
    montar(terminado({ won: false }));

    expect(screen.getByRole("heading", { name: "Hoy no salió" })).toBeInTheDocument();
    expect(screen.getByText("A las nueve")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tu nombre para el ranking")).toBeNull();
    expect(screen.getByText("12:36:08")).toBeInTheDocument();
  });
});
