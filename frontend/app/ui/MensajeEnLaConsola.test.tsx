import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El mensaje se muestra una sola vez por carga de la página: cada prueba parte de un módulo nuevo.
async function cargar() {
  vi.resetModules();
  return import("./MensajeEnLaConsola");
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consola = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MensajeEnLaConsola", () => {
  it("quien abre la consola del navegador se encuentra con la pregunta de siempre", async () => {
    const { MensajeEnLaConsola } = await cargar();

    render(<MensajeEnLaConsola />);

    const texto = consola.mock.calls.map((llamada) => String(llamada[0])).join("\n");
    expect(texto).toContain("¿Qué pretende usted de mí?");
  });

  it("el título va con estilo (violeta y grande) y lo demás en texto común", async () => {
    const { MensajeEnLaConsola } = await cargar();

    render(<MensajeEnLaConsola />);

    const [titulo] = consola.mock.calls;
    expect(String(titulo[0])).toMatch(/^%c/);
    expect(String(titulo[1])).toMatch(/#6c4ff0/i);
  });

  it("invita a mandar sugerencias, que es lo que alguien con la consola abierta probablemente quiera", async () => {
    const { MensajeEnLaConsola } = await cargar();

    render(<MensajeEnLaConsola />);

    expect(consola.mock.calls.flat().join(" ")).toMatch(/sugerencias/i);
  });

  it("se muestra una sola vez por carga de la página, aunque el componente se monte de nuevo", async () => {
    const { MensajeEnLaConsola } = await cargar();

    const primero = render(<MensajeEnLaConsola />);
    const llamadas = consola.mock.calls.length;
    primero.unmount();
    render(<MensajeEnLaConsola />);

    expect(llamadas).toBeGreaterThan(0);
    expect(consola.mock.calls.length).toBe(llamadas);
  });

  it("no dibuja nada en la página", async () => {
    const { MensajeEnLaConsola } = await cargar();

    const { container } = render(<MensajeEnLaConsola />);

    expect(container).toBeEmptyDOMElement();
  });
});
