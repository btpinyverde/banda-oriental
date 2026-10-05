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
    expect(screen.queryByRole("button", { name: "Creá una" })).toBeNull();
    expect(screen.queryByLabelText("Contraseña")).toBeNull();
  });
});

describe("con las cuentas prendidas", () => {
  it("/login es una pantalla propia: el logo y el camino de vuelta, sin la barra ni el pie del sitio", async () => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "1");

    render(<PaginaLogin />);

    expect(screen.getByRole("link", { name: "Banda Oriental, inicio" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Volver al inicio/ })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("navigation", { name: "Principal" })).toBeNull();
    expect(screen.queryByText("PRÓXIMAMENTE")).toBeNull();
  });

  it("/login muestra el formulario para entrar", async () => {
    vi.stubEnv("NEXT_PUBLIC_CUENTAS_ACTIVAS", "1");

    render(<PaginaLogin />);

    expect(await screen.findByRole("heading", { level: 1, name: "Iniciá sesión" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Creá una" })).toBeInTheDocument();
  });
});
