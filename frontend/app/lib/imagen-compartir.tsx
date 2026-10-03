import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { COLOR_FONDO } from "./seo";

export const TAMANO_COMPARTIR = { width: 1200, height: 630 };
export const ALT_COMPARTIR = "Banda Oriental: el juego diario de canciones uruguayas";

/** Lee un SVG de public/assets y lo devuelve como data URI, que es lo que admite ImageResponse. */
async function svg(nombre: string) {
  const contenido = await readFile(join(process.cwd(), "public", "assets", `${nombre}.svg`));
  return `data:image/svg+xml;base64,${contenido.toString("base64")}`;
}

/**
 * Imagen que aparece al compartir el link (WhatsApp, Instagram, X, etc.): título en lettering,
 * los dos personajes con el VS y las manchas de la marca. Se genera al compilar.
 */
export async function crearImagenCompartir() {
  const [marca, titulo, amarilla, violeta, gorra, rulos, versus] = await Promise.all([
    svg("brand-wordmark"),
    svg("headline-lettering"),
    svg("hero-blob-yellow"),
    svg("hero-blob-purple"),
    svg("art-personaje-gorra"),
    svg("art-personaje-rulos"),
    svg("art-versus"),
  ]);

  /* eslint-disable @next/next/no-img-element -- ImageResponse no usa next/image */
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: COLOR_FONDO }}>
        <img src={amarilla} width={470} height={420} alt="" style={{ position: "absolute", left: 700, top: 20 }} />
        <img src={violeta} width={250} height={336} alt="" style={{ position: "absolute", left: 980, top: 250 }} />

        <img src={marca} width={190} height={102} alt="" style={{ position: "absolute", left: 70, top: 56 }} />
        <img src={titulo} width={620} height={268} alt="" style={{ position: "absolute", left: 62, top: 190 }} />
        <div
          style={{
            position: "absolute",
            left: 70,
            top: 480,
            display: "flex",
            fontSize: 34,
            color: "#4a4540",
          }}
        >
          El juego diario de la música uruguaya
        </div>
        <div style={{ position: "absolute", left: 70, top: 540, display: "flex", fontSize: 28, color: "#6c4ff0" }}>
          bandaoriental.xami.uy
        </div>

        <img src={versus} width={190} height={177} alt="" style={{ position: "absolute", left: 800, top: 130 }} />
        <img src={gorra} width={250} height={241} alt="" style={{ position: "absolute", left: 700, top: 270 }} />
        <img src={rulos} width={230} height={250} alt="" style={{ position: "absolute", left: 930, top: 250 }} />
      </div>
    ),
    { ...TAMANO_COMPARTIR },
  );
}
