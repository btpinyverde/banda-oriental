import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PaginaCuenta from "../cuenta/page";
import PaginaEntrar from "../cuenta/entrar/page";
import PaginaLogin from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("con las cuentas apagadas", () => {
  it.each([
    ["/login", PaginaLogin],
    ["/cuenta", PaginaCuenta],
    ["/cuenta/entrar", PaginaEntrar],
  ])("%s dice que las cuentas llegan pronto y no ofrece ningún formulario", (_ruta, Pagina) => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "");

    render(<Pagina />);

    expect(screen.getByText("PRÓXIMAMENTE")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Crear cuenta" })).toBeNull();
    expect(screen.queryByLabelText("Contraseña")).toBeNull();
  });
});

describe("con las cuentas prendidas", () => {
  it("/login muestra el formulario", () => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "1");

    render(<PaginaLogin />);

    expect(screen.getByRole("tab", { name: "Crear cuenta" })).toBeInTheDocument();
    expect(screen.queryByText("PRÓXIMAMENTE")).toBeNull();
  });
});
