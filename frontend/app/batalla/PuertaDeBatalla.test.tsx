import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as puerta from "../lib/batallas/usePuedeCrearBatallas";
import { PuertaDeBatalla } from "./PuertaDeBatalla";

vi.mock("./CrearBatalla", () => ({ CrearBatalla: () => <p>FORMULARIO PARA CREAR</p> }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const poner = (valor: { puede: boolean; lista: boolean }) => vi.spyOn(puerta, "usePuedeCrearBatallas").mockReturnValue(valor);

describe("PuertaDeBatalla", () => {
  it("a quien puede crear le muestra el formulario", () => {
    poner({ puede: true, lista: true });
    render(<PuertaDeBatalla />);
    expect(screen.getByText("FORMULARIO PARA CREAR")).toBeInTheDocument();
  });

  it("a quien no puede le dice que la página no existe, sin revelar el modo", () => {
    poner({ puede: false, lista: true });
    render(<PuertaDeBatalla />);
    expect(screen.getByRole("heading", { name: /no encontramos esta página/i })).toBeInTheDocument();
    expect(screen.queryByText("FORMULARIO PARA CREAR")).toBeNull();
    expect(document.body.textContent?.toLowerCase()).not.toContain("batalla");
  });

  it("mientras no sabe no muestra nada de lo uno ni de lo otro", () => {
    poner({ puede: false, lista: false });
    render(<PuertaDeBatalla />);
    expect(screen.queryByText("FORMULARIO PARA CREAR")).toBeNull();
    expect(screen.queryByRole("heading", { name: /no encontramos/i })).toBeNull();
  });
});
