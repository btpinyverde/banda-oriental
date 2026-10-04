import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPCIONES, RESPUESTA } from "../lib/tutorial/practica";
import { TutorialInteractivo } from "./TutorialInteractivo";

afterEach(cleanup);

const montar = () => {
  const alCerrar = vi.fn();
  const sonar = vi.fn();
  render(<TutorialInteractivo alCerrar={alCerrar} sonar={sonar} />);
  return { alCerrar, sonar };
};
const pulsar = (nombre: RegExp | string) => fireEvent.click(screen.getByRole("button", { name: nombre }));
const elegir = (titulo: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(titulo) }));
const abiertas = () => document.querySelectorAll(".stem--abierta").length;
const empezar = () => pulsar("Empezar");
const escucharYSeguir = () => {
  pulsar(/Escuchar/);
  pulsar("Seguir");
};

describe("TutorialInteractivo: la entrada", () => {
  it("es un diálogo modal que dice que se juega con una canción de práctica y deja empezar o saltar", () => {
    montar();

    const dialogo = screen.getByRole("dialog", { name: /Cómo se juega/ });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(within(dialogo).getByText(/canción de práctica/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saltar" })).toBeInTheDocument();
  });

  it("se puede saltar en cualquier momento, también con Escape", () => {
    const { alCerrar } = montar();
    pulsar("Saltar");
    expect(alCerrar).toHaveBeenCalledTimes(1);

    cleanup();
    const otro = montar();
    empezar();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(otro.alCerrar).toHaveBeenCalledTimes(1);
  });
});

describe("TutorialInteractivo: las pistas", () => {
  it("arranca con una sola pista abierta y hay que escucharla para seguir", () => {
    const { sonar } = montar();
    empezar();

    expect(abiertas()).toBe(1);
    expect(screen.getByRole("button", { name: "Seguir" })).toBeDisabled();

    pulsar(/Escuchar/);

    expect(sonar).toHaveBeenCalledWith(["drums"]);
    expect(screen.getByRole("button", { name: "Seguir" })).toBeEnabled();
  });
});

describe("TutorialInteractivo: adivinar", () => {
  const adivinar = () => {
    const cierre = montar();
    empezar();
    escucharYSeguir();
    return cierre;
  };
  const noRespuesta = OPCIONES.find((o) => o.id !== RESPUESTA.id && o.artist !== RESPUESTA.artist)!;

  it("ofrece canciones de práctica para elegir y empieza con la tabla vacía", () => {
    adivinar();

    for (const opcion of OPCIONES) expect(screen.getByRole("button", { name: new RegExp(opcion.title) })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Intentos" })).toBeInTheDocument();
  });

  it("un error pinta la fila, abre la siguiente pista y explica los colores", () => {
    const { sonar } = adivinar();

    elegir(noRespuesta.title);

    expect(within(screen.getByRole("table", { name: "Intentos" })).getAllByText(noRespuesta.title).length).toBeGreaterThan(0);
    expect(abiertas()).toBe(2);
    expect(screen.getByRole("status")).toHaveTextContent(/verde/i);
    expect(screen.getByRole("status")).toHaveTextContent(/pista/i);
    expect(sonar).not.toHaveBeenCalledWith(expect.arrayContaining(["bass"])); // suena solo si la persona lo pide
  });

  it("se puede escuchar lo desbloqueado, todas las pistas juntas", () => {
    const { sonar } = adivinar();
    elegir(noRespuesta.title);

    pulsar(/Escuchar/);

    expect(sonar).toHaveBeenLastCalledWith(["drums", "bass"]);
  });

  it("una canción que no es la respuesta pero coincide en casi todo se explica: solo la canción exacta gana", () => {
    adivinar();
    const hermana = OPCIONES.find((o) => o.album === RESPUESTA.album && o.id !== RESPUESTA.id)!;

    elegir(hermana.title);

    expect(screen.getByRole("status")).toHaveTextContent(/no es la canción/i);
    expect(screen.queryByText("¡Listo!")).toBeNull();
  });

  it("una opción ya probada no se puede elegir otra vez", () => {
    adivinar();
    elegir(noRespuesta.title);

    expect(screen.getByRole("button", { name: new RegExp(noRespuesta.title) })).toBeDisabled();
  });

  it("acertar lleva al cierre, que explica el puntaje y deja ir a jugar la de hoy", () => {
    const { alCerrar } = adivinar();

    elegir(RESPUESTA.title);

    expect(screen.getByRole("heading", { name: /Listo/ })).toBeInTheDocument();
    expect(screen.getByText(/menos intentos/i)).toBeInTheDocument();
    pulsar("Jugar la de hoy");
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("no hay forma de quedarse trabado: probando todas las opciones se llega al cierre", () => {
    adivinar();

    for (const opcion of OPCIONES) {
      const boton = screen.queryByRole("button", { name: new RegExp(opcion.title) });
      if (boton && !(boton as HTMLButtonElement).disabled) fireEvent.click(boton);
    }

    expect(screen.getByRole("heading", { name: /Listo/ })).toBeInTheDocument();
  });
});
