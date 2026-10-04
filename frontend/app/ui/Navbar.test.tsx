import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Navbar } from "./Navbar";

afterEach(cleanup);

const principal = () => screen.getByRole("navigation", { name: "Principal" });

describe("Navbar", () => {
  it("en la home no marca ningún enlace y ofrece Jugar el diario", () => {
    render(<Navbar />);

    expect(principal().querySelector("[aria-current]")).toBeNull();
    expect(screen.getByRole("link", { name: "Jugar el diario" })).toHaveAttribute("href", "/jugar");
  });

  it("en /jugar marca ese enlace como la página actual y quita Jugar el diario", () => {
    render(<Navbar actual="/jugar" />);

    expect(screen.getByRole("link", { name: "Jugar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Ranking" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: "Jugar el diario" })).toBeNull();
  });

  it("en otra página sigue mostrando Jugar el diario", () => {
    render(<Navbar actual="/ranking" />);

    expect(screen.getByRole("link", { name: "Ranking" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Jugar el diario" })).toBeInTheDocument();
  });
});
