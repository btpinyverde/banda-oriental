import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { leerParametrosPosicion, type DatosPosicion } from "../../lib/compartir/posicion";
import { SITIO_URL } from "../../lib/seo";

/**
 * Imagen para presumir el puesto del ranking en una story (1080 × 1920). Todo lo que dibuja sale del link: la escala,
 * el puesto, los puntos, las partidas, el total de jugadores y el nombre. Ver app/lib/compartir/posicion.ts.
 */
const ANCHO = 1080;
const ALTO = 1920;

// Tipografía manuscrita (Caveat Brush, licencia OFL), recortada a los caracteres que se usan (latín y puntuación).
const manuscrita = await readFile(join(process.cwd(), "app", "compartir", "story", "CaveatBrush-subset.ttf"));
const marca = await readFile(join(process.cwd(), "public", "assets", "brand-wordmark.svg"));
const uri = (contenido: string | Buffer) => `data:image/svg+xml;base64,${Buffer.from(contenido).toString("base64")}`;

const RAYAS = uri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 53 66"><path d="m19 8-16 23m36-4L10 42m35 16-28 1" stroke="#0c0c0c" stroke-width="4.4" stroke-linecap="round" fill="none"/></svg>',
);
const TINTA = "#0c0c0c";
const FUENTE = "Caveat Brush";
const numero = new Intl.NumberFormat("es-UY");

const TITULO: Record<DatosPosicion["periodo"], string> = {
  day: "Ranking de hoy",
  week: "Ranking de la semana",
  month: "Ranking del mes",
  all: "Ranking de siempre",
};

/** El número del puesto se achica para que entre aunque tenga cinco cifras. */
const tamanioPuesto = (puesto: number) => {
  const cifras = String(puesto).length;
  return cifras <= 2 ? 380 : cifras === 3 ? 320 : cifras === 4 ? 250 : 200;
};

function Posicion({ datos }: { datos: DatosPosicion }) {
  const primero = datos.puesto === 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: ANCHO, height: ALTO, background: "#9b8af7", position: "relative" }}>
      <img src={RAYAS} width={70} height={88} alt="" style={{ position: "absolute", left: 470, top: 40 }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", padding: "96px 84px 0" }}>
        <img src={uri(marca)} width={330} height={177} alt="" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 110 }}>
        <div style={{ display: "flex", fontFamily: FUENTE, fontSize: 88, color: TINTA }}>{TITULO[datos.periodo]}</div>
        <div style={{ display: "flex", marginTop: 14, fontFamily: FUENTE, fontSize: 70, color: TINTA }}>
          {primero ? "¡Voy primero!" : "Mi puesto"}
        </div>
        <div style={{ display: "flex", marginTop: 30, padding: "0 90px 34px", borderRadius: 90, background: "#ffe066", transform: "rotate(-3deg)" }}>
          <div style={{ display: "flex", fontFamily: FUENTE, fontSize: tamanioPuesto(datos.puesto), lineHeight: 1.1, color: TINTA }}>#{datos.puesto}</div>
        </div>
        {datos.jugadores !== undefined && (
          <div style={{ display: "flex", marginTop: 34, fontFamily: FUENTE, fontSize: 80, color: TINTA }}>
            de {numero.format(datos.jugadores)} {datos.jugadores === 1 ? "jugador" : "jugadores"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 64, padding: "40px 70px", alignSelf: "center", borderRadius: 72, background: "rgba(255,255,255,0.34)" }}>
        {datos.nombre && <div style={{ display: "flex", fontFamily: FUENTE, fontSize: 84, color: TINTA }}>{datos.nombre}</div>}
        <div style={{ display: "flex", marginTop: datos.nombre ? 10 : 0, fontFamily: FUENTE, fontSize: 118, color: TINTA }}>
          {numero.format(datos.puntos)} puntos
        </div>
        <div style={{ display: "flex", marginTop: 6, fontFamily: FUENTE, fontSize: 60, color: "#3b3550" }}>
          en {numero.format(datos.partidas)} {datos.partidas === 1 ? "partida" : "partidas"}
        </div>
      </div>

      <div style={{ display: "flex", position: "absolute", right: 84, bottom: 62, fontFamily: FUENTE, fontSize: 72, color: TINTA }}>¿Me ganás?</div>
      <div style={{ display: "flex", position: "absolute", left: 84, bottom: 70, fontFamily: FUENTE, fontSize: 56, color: TINTA }}>
        {new URL(SITIO_URL).host}
      </div>
    </div>
  );
}

export async function GET(request: Request) {
  const datos = leerParametrosPosicion(new URL(request.url).searchParams);
  if (!datos) return new Response("Datos inválidos para la imagen.", { status: 400 });

  return new ImageResponse(<Posicion datos={datos} />, {
    width: ANCHO,
    height: ALTO,
    fonts: [{ name: FUENTE, data: manuscrita, style: "normal", weight: 400 }],
    // El link determina la imagen por completo: se puede guardar en caché sin vencimiento.
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
