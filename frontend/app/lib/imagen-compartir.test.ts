// @vitest-environment node
import { describe, expect, it } from "vitest";
import { crearImagenCompartir, TAMANO_COMPARTIR } from "./imagen-compartir";

describe("crearImagenCompartir", () => {
  it("genera la imagen PNG de 1200 × 630 que se ve al compartir el link", async () => {
    const respuesta = await crearImagenCompartir();
    const bytes = new Uint8Array(await respuesta.arrayBuffer());

    expect(respuesta.headers.get("content-type")).toBe("image/png");
    expect(TAMANO_COMPARTIR).toEqual({ width: 1200, height: 630 });
    // Firma de un PNG y ancho/alto leídos del encabezado IHDR.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const vista = new DataView(bytes.buffer);
    expect(vista.getUint32(16)).toBe(1200);
    expect(vista.getUint32(20)).toBe(630);
  });
});
