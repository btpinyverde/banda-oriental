import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FilaStems } from "./FilaStems";
import type { StemInfo } from "../lib/juego/tipos";

afterEach(cleanup);

const stem = (stem_type: StemInfo["stem_type"], unlock_order: number): StemInfo => ({ stem_type, unlock_order, url: "x" });

describe("FilaStems", () => {
  it("muestra las cuatro pistas con su nombre", () => {
    render(<FilaStems desbloqueadas={[stem("drums", 1)]} />);

    for (const nombre of ["Batería", "Bajo", "Otros", "Voz"]) {
      expect(screen.getByText(nombre)).toBeInTheDocument();
    }
  });

  it("distingue las abiertas de las bloqueadas con texto para lectores de pantalla", () => {
    render(<FilaStems desbloqueadas={[stem("drums", 1), stem("bass", 2)]} />);

    const lista = screen.getByRole("list", { name: "Pistas" });
    expect(lista.querySelectorAll("li.stem--abierta")).toHaveLength(2);
    expect(lista.querySelectorAll("li.stem--bloqueada")).toHaveLength(2);
    expect(screen.getByText("Batería").closest("li")).toHaveTextContent("desbloqueada");
    expect(screen.getByText("Voz").closest("li")).toHaveTextContent("bloqueada");
  });

  it("debajo de cada nombre dice qué número de pista es", () => {
    render(<FilaStems desbloqueadas={[stem("drums", 1)]} />);

    for (const [nombre, pista] of [["Batería", "Pista 1"], ["Bajo", "Pista 2"], ["Otros", "Pista 3"], ["Voz", "Pista 4"]]) {
      expect(screen.getByText(nombre).closest("li")).toHaveTextContent(pista);
    }
  });
});
