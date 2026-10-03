import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { COLOR_FONDO } from "./seo";

export const TAMANO_COMPARTIR = { width: 1200, height: 630 };
export const ALT_COMPARTIR = "Banda Oriental: el juego diario de canciones uruguayas";

const leer = (...partes: string[]) => readFile(join(process.cwd(), ...partes));

/** Lee un SVG de public/assets y lo devuelve como data URI, que es lo que admite ImageResponse. */
async function svg(nombre: string) {
  const contenido = await leer("public", "assets", `${nombre}.svg`);
  return `data:image/svg+xml;base64,${contenido.toString("base64")}`;
}

/** Triángulo de play en blanco. Los triángulos hechos con bordes CSS no se dibujan bien en ImageResponse. */
const PLAY_BLANCO = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 16"><path d="M1 1.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 1 1.5Z" fill="#fff"/></svg>',
).toString("base64")}`;

/* Colores de la tarjeta del juego de la hero (app/globals.css). */
const ACIERTO = "#a9e6c4";
const CERCA = "#f6ee9a";
const ERROR = "#ffb3c7";
const GRIS = "#e9e6e1";
const VIOLETA = "#6c4ff0";

type Celda = [texto: string, color: string];

const COLUMNAS = [
  { nombre: "Canción", ancho: 104 },
  { nombre: "Año", ancho: 50 },
  { nombre: "Género", ancho: 58 },
  { nombre: "Artista", ancho: 104 },
  { nombre: "Disco", ancho: 50 },
];

const INTENTOS: Celda[][] = [
  [["A Don José", ACIERTO], ["2002", ACIERTO], ["Rock", ACIERTO], ["Tabaré Cardozo", ERROR], ["", ERROR]],
  [["Brindis por Pierrot", CERCA], ["2001", CERCA], ["Rock", CERCA], ["No Te Va Gustar", CERCA], ["", ERROR]],
  [["A las nueve", ACIERTO], ["2004", ACIERTO], ["Pop", ACIERTO], ["No Te Va Gustar", ACIERTO], ["", ACIERTO]],
];

const celda = (ancho: number, fondo: string, texto = "") => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      width: ancho,
      height: 24,
      padding: "0 7px",
      borderRadius: 7,
      background: fondo,
      fontSize: 11,
      fontWeight: 700,
      color: "#14110f",
      whiteSpace: "nowrap",
      overflow: "hidden",
    }}
  >
    {texto}
  </div>
);

/** La tarjeta del juego, igual que la de la hero: chips, reproductor, stems y tabla de intentos. */
function TarjetaJuego({ iconos }: { iconos: Record<string, string> }) {
  const stems = [
    { nombre: "Batería", icono: iconos.bateria, fondo: "#7ee0a8", ancho: 22, alto: 19 },
    { nombre: "Bajo", icono: iconos.bajo, fondo: "#fde668", ancho: 18, alto: 22 },
    { nombre: "Voz", icono: iconos.voz, fondo: GRIS, ancho: 14, alto: 20 },
    { nombre: "Otros", icono: iconos.candado, fondo: GRIS, ancho: 20, alto: 20 },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 430,
        padding: 22,
        borderRadius: 30,
        background: "#ffffff",
        boxShadow: "0 24px 60px rgba(60, 40, 120, 0.22)",
        transform: "rotate(-4deg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", height: 28, padding: "0 12px", alignItems: "center", borderRadius: 99, background: "#f1eef9", fontSize: 14, fontWeight: 700 }}>
          #138
        </div>
        <div style={{ display: "flex", height: 28, padding: "0 12px", marginLeft: 8, alignItems: "center", borderRadius: 99, background: "#f1eef9", fontSize: 14, fontWeight: 700 }}>
          Modo clásico
        </div>
        <div style={{ display: "flex", marginLeft: "auto", alignItems: "center", fontSize: 11, color: "#4a4540" }}>
          Nueva canción en
          <div style={{ display: "flex", height: 28, padding: "0 12px", marginLeft: 8, alignItems: "center", borderRadius: 99, background: "#ffffff", boxShadow: "0 2px 8px rgba(20,17,15,0.16)", fontSize: 14, fontWeight: 700, color: "#14110f" }}>
            12:36:08
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", height: 56, marginTop: 16, padding: "0 18px 0 6px", borderRadius: 99, background: "#f3f0fc" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 99, background: VIOLETA }}>
          <img src={PLAY_BLANCO} width={16} height={18} alt="" style={{ marginLeft: 3 }} />
        </div>
        <img src={iconos.onda} width={190} height={23} alt="" style={{ marginLeft: 14 }} />
        <div style={{ display: "flex", marginLeft: "auto", fontSize: 11, color: "#4a4540" }}>0:00 / 0:30</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, padding: "0 14px" }}>
        {stems.map((s) => (
          <div key={s.nombre} style={{ display: "flex", flexDirection: "column", alignItems: "center", fontSize: 11, fontWeight: 700 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: 99, background: s.fondo }}>
              <img src={s.icono} width={s.ancho} height={s.alto} alt="" />
            </div>
            <div style={{ display: "flex", marginTop: 4 }}>{s.nombre}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
        <div style={{ display: "flex" }}>
          {COLUMNAS.map((c, i) => (
            <div key={c.nombre} style={{ display: "flex", marginLeft: i === 0 ? 0 : 5 }}>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: c.ancho, height: 20, borderRadius: 6, background: GRIS, fontSize: 10, color: "#4a4540" }}>
                {c.nombre}
              </div>
            </div>
          ))}
        </div>
        {INTENTOS.map((fila, f) => (
          <div key={f} style={{ display: "flex", marginTop: 5 }}>
            {fila.map(([texto, color], i) => (
              <div key={i} style={{ display: "flex", marginLeft: i === 0 ? 0 : 5 }}>
                {celda(COLUMNAS[i].ancho, color, texto)}
              </div>
            ))}
          </div>
        ))}
        {[0, 1].map((f) => (
          <div key={f} style={{ display: "flex", marginTop: 5 }}>
            {COLUMNAS.map((c, i) => (
              <div key={c.nombre} style={{ display: "flex", marginLeft: i === 0 ? 0 : 5 }}>
                {celda(c.ancho, "#efece8")}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Imagen que aparece al compartir el link (WhatsApp, Instagram, X, etc.). Muestra el juego diario,
 * que es lo que promete el título: el lettering a la izquierda y, a la derecha, la composición de la
 * hero (tarjeta del juego, sticker de las reglas y manchas). Se genera al compilar.
 */
export async function crearImagenCompartir() {
  const [marca, titulo, amarilla, violeta, sticker, flor, onda, bateria, bajo, voz, candado] =
    await Promise.all([
      svg("brand-wordmark"),
      svg("headline-lettering"),
      svg("hero-blob-yellow"),
      svg("hero-blob-purple"),
      svg("sticker-six-attempts-pink"),
      svg("hero-flower"),
      svg("hero-waveform"),
      svg("icon-drums"),
      svg("icon-bass"),
      svg("icon-voice"),
      svg("lock"),
    ]);

  /* eslint-disable @next/next/no-img-element -- ImageResponse no usa next/image */
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: COLOR_FONDO }}>
        <img src={amarilla} width={430} height={384} alt="" style={{ position: "absolute", left: 690, top: 60 }} />
        <img src={violeta} width={200} height={268} alt="" style={{ position: "absolute", left: 1020, top: 150 }} />

        <img src={marca} width={190} height={102} alt="" style={{ position: "absolute", left: 70, top: 56 }} />
        <img src={titulo} width={620} height={268} alt="" style={{ position: "absolute", left: 62, top: 190 }} />
        <div style={{ position: "absolute", left: 70, top: 480, display: "flex", fontSize: 34, color: "#4a4540" }}>
          El juego diario de la música uruguaya
        </div>
        <div style={{ position: "absolute", left: 70, top: 540, display: "flex", fontSize: 28, color: VIOLETA }}>
          bandaoriental.xami.uy
        </div>

        <div style={{ position: "absolute", left: 722, top: 148, display: "flex" }}>
          <TarjetaJuego iconos={{ bateria, bajo, voz, candado, onda }} />
        </div>

        <img src={sticker} width={158} height={149} alt="" style={{ position: "absolute", left: 1030, top: 8 }} />
        <img src={flor} width={66} height={71} alt="" style={{ position: "absolute", left: 1108, top: 528 }} />
      </div>
    ),
    { ...TAMANO_COMPARTIR },
  );
}
