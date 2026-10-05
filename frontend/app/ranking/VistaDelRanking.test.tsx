import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as puerta from "../lib/batallas/usePuedeCrearBatallas";
import { VistaDelRanking } from "./VistaDelRanking";

vi.mock("./Ranking", () => ({ Ranking: ({ selector }: { selector?: React.ReactNode }) => <div>RANKING DIARIO{selector}</div> }));
vi.mock("./MisBatallas", () => ({ MisBatallas: ({ selector }: { selector?: React.ReactNode }) => <div>MIS BATALLAS{selector}</div> }));

beforeEach(() => window.history.replaceState(null, "", "/ranking"));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("VistaDelRanking", () => {
  it("con el modo batalla apagado es solo el ranking diario, sin selector", () => {
    render(<VistaDelRanking />);
    expect(screen.getByText(/ranking diario/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mis batallas/i })).toBeNull();
  });

  it("con el modo batalla encendido hay un selector Diario | Mis batallas", () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "1");
    render(<VistaDelRanking />);

    expect(screen.getByRole("button", { name: "Diario" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Mis batallas" }));
    expect(screen.getByText(/^MIS BATALLAS/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mis batallas" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Diario" }));
    expect(screen.getByText(/^RANKING DIARIO/)).toBeInTheDocument();
  });

  it("con el modo apagado para todos, una cuenta autorizada igual ve el selector", () => {
    vi.spyOn(puerta, "usePuedeCrearBatallas").mockReturnValue({ puede: true, lista: true });
    render(<VistaDelRanking />);
    expect(screen.getByRole("button", { name: "Mis batallas" })).toBeInTheDocument();
  });

  it("?vista=batallas abre directo en Mis batallas", async () => {
    vi.stubEnv("NEXT_PUBLIC_BATALLA_ACTIVA", "1");
    window.history.replaceState(null, "", "/ranking?vista=batallas");
    render(<VistaDelRanking />);
    expect(await screen.findByText(/^MIS BATALLAS/)).toBeInTheDocument();
  });
});
