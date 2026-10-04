import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { leerParametros, type DatosStory } from "../../lib/compartir/story";
import { SITIO_URL } from "../../lib/seo";

/**
 * Imagen para compartir el resultado en una story (1080 × 1920). Todo lo que dibuja sale del link: la cuadrícula de
 * colores, los intentos y, solo en la versión "revelada", la canción. Ver app/lib/compartir/story.ts.
 */
const ANCHO = 1080;
const ALTO = 1920;

// Tipografía manuscrita (Caveat Brush, licencia OFL), recortada a los caracteres que se usan.
const manuscrita = await readFile(join(process.cwd(), "app", "compartir", "story", "CaveatBrush-subset.ttf"));
const marca = await readFile(join(process.cwd(), "public", "assets", "brand-wordmark.svg"));
const manchaRosa = await readFile(join(process.cwd(), "public", "assets", "jugar-mancha-rosa-nota.svg"));
const instagram = await readFile(join(process.cwd(), "public", "assets", "social-instagram.svg"));
const notaMusical = await readFile(join(process.cwd(), "public", "assets", "music-note.svg"));

const uri = (contenido: string | Buffer) => `data:image/svg+xml;base64,${Buffer.from(contenido).toString("base64")}`;

const TILDE = uri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
);
const RAYAS = uri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 53 66"><path d="m19 8-16 23m36-4L10 42m35 16-28 1" stroke="#0c0c0c" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
);
const GARABATO = uri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 96"><path d="M8 78c16 4 30-8 36-30C50 26 44 10 32 14c-14 5-6 38 14 52 22 15 34-4 36-26 2-20-4-32-14-28-12 5-6 34 10 48 10 9 28 8 44-14" stroke="#0c0c0c" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
);
const RAYO = uri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 90"><path d="M44 6C30 22 22 34 30 42c8 8 18 4 10 18-6 10-18 18-30 24" stroke="#0c0c0c" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
);

const TINTA = "#0c0c0c";
const COLORES = { a: "#46c978", c: "#ffd75e", e: "#ee6a70" } as const;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const etiquetaDelDia = ({ numero, dia }: DatosStory) => {
  if (numero !== undefined) return `#${numero}`;
  if (!dia) return "";
  const [, mes, diaDelMes] = dia.split("-").map(Number);
  return `${diaDelMes} ${MESES[mes - 1]}`;
};

function Celda({ letra, vacia }: { letra: string; vacia: string }) {
  const color = letra in COLORES ? COLORES[letra as keyof typeof COLORES] : vacia;
  const conTilde = letra === "a" || letra === "c";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 128, height: 128, borderRadius: 28, background: color }}>
      {conTilde && <img src={TILDE} width={76} height={76} alt="" />}
    </div>
  );
}

/** Las seis filas de la cuadrícula: las de los intentos con sus colores y el resto vacías. */
function Cuadricula({ filas, vacia }: { filas: string[]; vacia: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", marginTop: i === 0 ? 0 : 22 }}>
          <div style={{ display: "flex", width: 96, fontFamily: "Caveat Brush", fontSize: 72, color: TINTA }}>{i + 1}</div>
          {Array.from({ length: 4 }, (_, j) => (
            <div key={j} style={{ display: "flex", marginLeft: j === 0 ? 0 : 28 }}>
              <Celda letra={filas[i]?.[j] ?? "-"} vacia={vacia} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Cabecera({ datos }: { datos: DatosStory }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "96px 84px 0" }}>
      <img src={uri(marca)} width={330} height={177} alt="" />
      <div style={{ display: "flex", fontFamily: "Caveat Brush", fontSize: 92, color: TINTA }}>{etiquetaDelDia(datos)}</div>
    </div>
  );
}

function Pie() {
  return (
    <div style={{ display: "flex", position: "absolute", left: 84, bottom: 70, fontFamily: "Caveat Brush", fontSize: 56, color: TINTA }}>
      {new URL(SITIO_URL).host}
    </div>
  );
}

/** Versión "oculta": no dice cuál era la canción, para no quemarla a quien todavía no jugó ese día. */
function StoryOculta({ datos }: { datos: DatosStory }) {
  const salio = datos.intentos !== null;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: ANCHO, height: ALTO, background: "#9b8af7", position: "relative" }}>
      <img src={RAYAS} width={70} height={88} alt="" style={{ position: "absolute", left: 470, top: 40 }} />
      <Cabecera datos={datos} />

      <div style={{ display: "flex", alignSelf: "center", marginTop: 48, padding: "48px 56px 48px 36px", borderRadius: 72, background: "rgba(255,255,255,0.32)" }}>
        <Cuadricula filas={datos.filas} vacia="rgba(255,255,255,0.4)" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 56 }}>
        <div style={{ display: "flex", fontFamily: "Caveat Brush", fontSize: 80, color: TINTA }}>
          {salio ? "Conseguí la canción en" : "Hoy no salió"}
        </div>
        <div style={{ display: "flex", marginTop: 16, padding: "10px 64px 22px", borderRadius: 44, background: "#ffe066", transform: "rotate(-2deg)" }}>
          <div style={{ display: "flex", fontFamily: "Caveat Brush", fontSize: 136, color: TINTA }}>
            {salio ? `${datos.intentos} ${datos.intentos === 1 ? "intento" : "intentos"}` : "¡Mañana, otra!"}
          </div>
        </div>
      </div>

      <img src={GARABATO} width={190} height={140} alt="" style={{ position: "absolute", left: 70, bottom: 150 }} />
      <img src={RAYO} width={80} height={120} alt="" style={{ position: "absolute", right: 90, bottom: 170 }} />
      <Pie />
    </div>
  );
}

/** Versión "revelada": muestra la canción. Solo se ofrece cuando el día ya pasó. */
function StoryRevelada({ datos, cancion }: { datos: DatosStory; cancion: NonNullable<DatosStory["cancion"]> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: ANCHO, height: ALTO, background: "#fbf4e6", position: "relative" }}>
      <img src={uri(manchaRosa)} width={420} height={420} alt="" style={{ position: "absolute", left: -110, top: -90 }} />
      <img src={uri(manchaRosa)} width={560} height={560} alt="" style={{ position: "absolute", right: -190, bottom: -170 }} />
      <img src={RAYAS} width={70} height={88} alt="" style={{ position: "absolute", left: 470, top: 40 }} />
      <Cabecera datos={datos} />

      <div style={{ display: "flex", alignSelf: "center", marginTop: 48 }}>
        <Cuadricula filas={datos.filas} vacia="#e3e0dc" />
      </div>

      <div style={{ display: "flex", margin: "56px 84px 0", padding: 34, borderRadius: 64, background: "#ffe36e" }}>
        <div style={{ display: "flex", alignItems: "center", flex: 1, padding: 36, borderRadius: 40, background: "#fbf6e6" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 290, height: 290, borderRadius: 30, background: "#d9d2f7" }}>
            <img src={uri(notaMusical)} width={110} height={110} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 40 }}>
            <div style={{ display: "flex", fontFamily: "Caveat Brush", fontSize: cancion.titulo.length > 26 ? 64 : 92, lineHeight: 1, color: TINTA }}>
              {cancion.titulo}
            </div>
            <div style={{ display: "flex", marginTop: 16, fontFamily: "Caveat Brush", fontSize: 58, color: TINTA }}>{cancion.artista}</div>
            {cancion.disco && (
              <div style={{ display: "flex", marginTop: 8, fontFamily: "Caveat Brush", fontSize: 42, color: "#5a5560" }}>
                {cancion.disco}
                {cancion.anio !== undefined ? ` (${cancion.anio})` : ""}
              </div>
            )}
            {cancion.instagram && (
              <div style={{ display: "flex", alignItems: "center", marginTop: 22 }}>
                <img src={uri(instagram)} width={40} height={40} alt="" />
                <div style={{ display: "flex", marginLeft: 12, fontFamily: "Caveat Brush", fontSize: 40, color: TINTA }}>@{cancion.instagram}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <img src={GARABATO} width={190} height={140} alt="" style={{ position: "absolute", left: 600, bottom: 90 }} />
      <Pie />
    </div>
  );
}

export async function GET(request: Request) {
  const datos = leerParametros(new URL(request.url).searchParams);
  if (!datos) return new Response("Datos inválidos para la imagen.", { status: 400 });

  return new ImageResponse(datos.cancion ? <StoryRevelada datos={datos} cancion={datos.cancion} /> : <StoryOculta datos={datos} />, {
    width: ANCHO,
    height: ALTO,
    fonts: [{ name: "Caveat Brush", data: manuscrita, style: "normal", weight: 400 }],
    // El link determina la imagen por completo: se puede guardar en caché sin vencimiento.
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
