import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { ModeCards } from "./ModeCards";
import { Navbar } from "./Navbar";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const hayBatalla = () => document.body.innerHTML.toLowerCase().includes("batalla");

describe("el modo batalla, apagado con NEXT_PUBLIC_BATALLA_ACTIVA=0", () => {
  it("no aparece en la barra, el menú móvil, el pie, la portada ni las tarjetas de modos", () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "0");

    render(
      <>
        <Navbar />
        <Hero />
        <ModeCards />
        <Footer />
      </>,
    );

    expect(hayBatalla()).toBe(false);
    expect(document.querySelector('a[href="/batalla"]')).toBeNull();
  });

  it("lo demás sigue: jugar el diario, el archivo y las tarjetas del modo diario", () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "0");

    render(
      <>
        <Navbar />
        <ModeCards />
      </>,
    );

    expect(screen.getAllByRole("link", { name: /Jugar/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Archivo" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Modo diario")).toBeInTheDocument();
  });

  it("con el interruptor prendido vuelve a mostrarse en todos lados", () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "1");

    render(
      <>
        <Navbar />
        <Hero />
        <ModeCards />
        <Footer />
      </>,
    );

    expect(document.querySelectorAll('a[href="/batalla"]').length).toBeGreaterThanOrEqual(4);
  });
});
