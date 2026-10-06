import { describe, expect, it } from "vitest";
import { metadata } from "./page";

describe("página de crear batalla", () => {
  it("el título no repite el nombre del sitio ni delata el modo", () => {
    expect(metadata.title).toEqual({ absolute: "Banda Oriental" });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
