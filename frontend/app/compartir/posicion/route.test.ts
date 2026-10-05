// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "./route";

const pedir = (consulta: string) => GET(new Request(`https://bandaoriental.xami.uy/compartir/posicion?${consulta}`));

async function medidas(respuesta: Response) {
  const bytes = new Uint8Array(await respuesta.arrayBuffer());
  const vista = new DataView(bytes.buffer);
  return { firma: [...bytes.slice(0, 4)], ancho: vista.getUint32(16), alto: vista.getUint32(20), peso: bytes.length };
}

describe("GET /compartir/posicion", () => {
  it("devuelve una imagen PNG vertical de 1080 × 1920 para presumir el puesto", async () => {
    const respuesta = await pedir("p=week&r=3&s=2450&g=4&j=128&n=Ana");

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("image/png");
    const { firma, ancho, alto, peso } = await medidas(respuesta);
    expect(firma).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect([ancho, alto]).toEqual([1080, 1920]);
    expect(peso).toBeGreaterThan(10_000);
  });

  it.each(["day", "week", "month", "all"])("arma la imagen de la escala %s", async (periodo) => {
    expect((await pedir(`p=${periodo}&r=1&s=900&g=1`)).status).toBe(200);
  });

  it("funciona sin el total de jugadores ni el nombre, y con nombres con tildes, ñ y emojis", async () => {
    expect((await pedir("p=all&r=12&s=500&g=3")).status).toBe(200);
    expect((await pedir(`p=day&r=2&s=800&g=1&j=9&n=${encodeURIComponent("Niña Ñandú 🎸")}`)).status).toBe(200);
  });

  it("con cifras grandes sigue entrando (puesto de cinco cifras, puntos de siete)", async () => {
    expect((await pedir("p=all&r=12345&s=1234567&g=999&j=20000&n=Alguien")).status).toBe(200);
  });

  it.each(["", "p=year&r=3&s=1&g=1", "p=day&r=0&s=1&g=1", "p=day&r=9&s=1&g=1&j=3"])("rechaza datos inválidos (%s) con 400", async (consulta) => {
    const respuesta = await pedir(consulta);

    expect(respuesta.status).toBe(400);
    expect(respuesta.headers.get("content-type") ?? "").not.toContain("image/png");
  });

  it("como el link determina la imagen, se puede guardar en caché sin vencimiento", async () => {
    const respuesta = await pedir("p=day&r=1&s=900&g=1");

    expect(respuesta.headers.get("cache-control")).toContain("immutable");
  });
});
