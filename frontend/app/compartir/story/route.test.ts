// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "./route";

const pedir = (consulta: string) => GET(new Request(`https://bandaoriental.xami.uy/compartir/story?${consulta}`));

/** Ancho y alto de un PNG, leídos de su encabezado. */
async function medidas(respuesta: Response) {
  const bytes = new Uint8Array(await respuesta.arrayBuffer());
  const vista = new DataView(bytes.buffer);
  return { firma: [...bytes.slice(0, 4)], ancho: vista.getUint32(16), alto: vista.getUint32(20), peso: bytes.length };
}

describe("GET /compartir/story", () => {
  it("devuelve una imagen PNG vertical de 1080 × 1920 para una partida ganada", async () => {
    const respuesta = await pedir("g=caee.aaca.aaaa&i=3&n=138");

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("image/png");
    const { firma, ancho, alto, peso } = await medidas(respuesta);
    expect(firma).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect([ancho, alto]).toEqual([1080, 1920]);
    expect(peso).toBeGreaterThan(10_000);
  });

  it("también arma la imagen de una partida perdida", async () => {
    const respuesta = await pedir("g=caee.aeee.eeee.caee.aeee.eeee&i=x&d=2026-10-03");

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("image/png");
  });

  it("arma la versión revelada con la canción", async () => {
    const respuesta = await pedir("g=aaaa&i=1&n=135&t=A+las+nueve&a=No+Te+Va+Gustar&b=El+camino+m%C3%A1s+largo&y=2004&ig=notevagustaroficial");

    expect(respuesta.status).toBe(200);
    expect((await medidas(respuesta)).alto).toBe(1920);
  });

  it("como el link determina la imagen, se puede guardar en caché sin vencimiento", async () => {
    const respuesta = await pedir("g=aaaa&i=1");

    expect(respuesta.headers.get("cache-control")).toContain("immutable");
  });

  it("rechaza con 400 los datos que no sirven, sin generar nada", async () => {
    for (const malo of ["", "g=zzzz&i=3", "g=aaaa&i=9"]) {
      const respuesta = await pedir(malo);
      expect(respuesta.status).toBe(400);
    }
  });
});
