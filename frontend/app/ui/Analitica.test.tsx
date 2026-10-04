import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Analitica } from "./Analitica";

afterEach(cleanup);

describe("Analitica", () => {
  it("carga el script de Vercel Web Analytics cuando está activa", () => {
    const { container } = render(<Analitica activa />);

    const script = container.querySelector("script");
    expect(script).not.toBeNull();
    expect(script?.getAttribute("src")).toBe("/_vercel/insights/script.js");
    expect(script?.hasAttribute("defer")).toBe(true);
  });

  it("no agrega nada cuando no está activa (desarrollo y tests)", () => {
    const { container } = render(<Analitica activa={false} />);

    expect(container.querySelector("script")).toBeNull();
  });
});
