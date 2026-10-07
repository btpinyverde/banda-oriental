import { describe, expect, it } from "vitest";
import { CANCION_DEL_DIA_DEMO, CATALOGO_DEMO, crearClienteDemo } from "./cliente-demo";
import type { CancionCatalogo, EstadoEnCurso, EstadoTerminado } from "./tipos";

const ID = "11111111-2222-4333-8444-555555555555";

async function conCatalogo() {
  const cliente = crearClienteDemo();
  return { cliente, canciones: CATALOGO_DEMO };
}

describe("catálogo de demostración", () => {
  it("trae canciones con todos los datos que muestra la tabla", async () => {
    const { canciones } = await conCatalogo();

    expect(canciones.length).toBeGreaterThanOrEqual(8);
    for (const c of canciones) {
      expect(c).toMatchObject({ id: expect.any(Number), title: expect.any(String), artist: expect.any(String), album: expect.any(String) });
    }
  });

  it("incluye la canción del día, para que se pueda ganar", async () => {
    const { canciones } = await conCatalogo();

    expect(canciones.some((c) => c.id === CANCION_DEL_DIA_DEMO.id)).toBe(true);
  });
});

describe("estado del día de demostración", () => {
  it("arranca en el intento 1 con una sola pista desbloqueada", async () => {
    const { cliente } = await conCatalogo();

    const estado = (await cliente.estadoDelDia(ID)) as EstadoEnCurso;

    expect(estado.finished).toBe(false);
    expect(estado.attempt_number).toBe(1);
    expect(estado.attempts_remaining).toBe(6);
    expect(estado.unlocked_stems).toHaveLength(1);
    expect(estado.unlocked_stems[0]).toMatchObject({ stem_type: "drums", unlock_order: 1 });
    expect(estado.feedback_history).toEqual([]);
  });

  it("cada intento fallido suma una pista y avanza el número de intento", async () => {
    const { cliente, canciones } = await conCatalogo();
    const equivocada = canciones.find((c) => c.id !== CANCION_DEL_DIA_DEMO.id)!;

    const resultado = await cliente.enviarIntento(ID, 1, equivocada.id);
    const estado = (await cliente.estadoDelDia(ID)) as EstadoEnCurso;

    expect(resultado).toMatchObject({ is_correct: false, attempt_number: 1, finished: false, attempts_remaining: 5 });
    expect(estado.attempt_number).toBe(2);
    expect(estado.unlocked_stems).toHaveLength(2);
    expect(estado.feedback_history).toHaveLength(1);
    expect(estado.feedback_history[0].attempt_number).toBe(1);
  });
});

describe("feedback de demostración", () => {
  it("compara año, género, artista y disco igual que el backend", async () => {
    const { cliente, canciones } = await conCatalogo();
    const mismoArtista = canciones.find(
      (c) => c.artist === CANCION_DEL_DIA_DEMO.artist && c.album !== CANCION_DEL_DIA_DEMO.album,
    )!;

    const { feedback } = await cliente.enviarIntento(ID, 1, mismoArtista.id);

    expect(feedback.artist).toBe("same");
    expect(feedback.album).toBe("different");
    expect(["exact", "older", "newer"]).toContain(feedback.year);
  });
});

describe("cierre del juego de demostración", () => {
  it("al acertar termina, revela la canción y habilita enviar el puntaje", async () => {
    const { cliente } = await conCatalogo();

    const resultado = await cliente.enviarIntento(ID, 1, CANCION_DEL_DIA_DEMO.id);
    const estado = (await cliente.estadoDelDia(ID)) as EstadoTerminado;

    expect(resultado).toMatchObject({ is_correct: true, finished: true });
    expect(estado).toMatchObject({ finished: true, won: true, score_submitted: false });
    expect(estado.song.title).toBe(CANCION_DEL_DIA_DEMO.title);

    const puntaje = await cliente.enviarPuntaje(ID, "brandon", 20);
    expect(puntaje).toMatchObject({ winning_attempt: 1, display_name: "brandon" });
    expect(((await cliente.estadoDelDia(ID)) as EstadoTerminado).score_submitted).toBe(true);
  });

  it("al fallar seis veces termina como derrota y también revela la canción", async () => {
    const { cliente, canciones } = await conCatalogo();
    const equivocadas = canciones.filter((c) => c.id !== CANCION_DEL_DIA_DEMO.id);

    for (let n = 1; n <= 6; n++) await cliente.enviarIntento(ID, n, equivocadas[n - 1].id);
    const estado = (await cliente.estadoDelDia(ID)) as EstadoTerminado;

    expect(estado).toMatchObject({ finished: true, won: false });
    expect(estado.song.title).toBe(CANCION_DEL_DIA_DEMO.title);
  });

  it("rechaza un número de intento que no es el siguiente, como el backend", async () => {
    const { cliente } = await conCatalogo();

    await expect(cliente.enviarIntento(ID, 3, 1)).rejects.toMatchObject({ status: 400, message: "Número de intento inválido." });
  });

  it("no deja enviar el puntaje si todavía no se ganó", async () => {
    const { cliente } = await conCatalogo();

    await expect(cliente.enviarPuntaje(ID, "brandon", 10)).rejects.toMatchObject({ status: 400, message: "Todavía no ganaste hoy." });
  });
});

describe("demo con el catálogo real", () => {
  // Ids y datos distintos a los de la demo: así se comprueba que no se depende de ellos.
  const REAL: CancionCatalogo[] = [
    { id: 9001, title: "A Las Nueve", artist: "No te va Gustar", album: "El Camino Más Largo", year: 2008, genre: "Rock" },
    { id: 9002, title: "Sin Saber", artist: "No te va Gustar", album: "Aunque Cueste Ver El Sol", year: 2004, genre: "" },
    { id: 9003, title: "Luna Llena", artist: "Bárbara Jorcin", album: "Luna Llena", year: 2025, genre: "" },
  ];

  it("busca en las canciones que da la fuente en vez de las de ejemplo", async () => {
    const cliente = crearClienteDemo(async () => REAL);

    expect((await cliente.buscarCanciones("luna", 1)).canciones).toEqual([REAL[2]]);
  });

  it("acierta cuando se elige la canción de ejemplo aunque tenga otro id y otro formato de nombre", async () => {
    const cliente = crearClienteDemo(async () => REAL);

    const resultado = await cliente.enviarIntento(ID, 1, 9001);

    expect(resultado).toMatchObject({ is_correct: true, finished: true });
    expect(resultado.feedback).toEqual({ year: "exact", genre: "same", artist: "same", album: "same" });
  });

  it("un intento errado compara contra la canción de ejemplo", async () => {
    const cliente = crearClienteDemo(async () => REAL);

    const resultado = await cliente.enviarIntento(ID, 1, 9003);

    expect(resultado.is_correct).toBe(false);
    expect(resultado.feedback).toMatchObject({ artist: "different", album: "different", year: "older" });
  });

  it("un mismo artista del catálogo real cuenta como artista acertado", async () => {
    const cliente = crearClienteDemo(async () => REAL);

    const { feedback } = await cliente.enviarIntento(ID, 1, 9002);

    expect(feedback.artist).toBe("same");
  });

  it("rechaza un id que no está en el catálogo real", async () => {
    const cliente = crearClienteDemo(async () => REAL);

    await expect(cliente.enviarIntento(ID, 1, 1)).rejects.toMatchObject({ status: 400, message: "Canción no encontrada." });
  });
});

describe("buscarCanciones de demostración", () => {
  const CATALOGO = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, title: `Tema ${String(i + 1).padStart(2, "0")}`, artist: "Artista", album: "Disco", year: 2000, genre: "" }));

  it("busca como la API: todas las palabras, sin tildes ni mayúsculas, en título, artista o disco", async () => {
    const cliente = crearClienteDemo(async () => [
      { id: 1, title: "Candombe para Gardel", artist: "Rubén Rada", album: "Candombe", year: 1985, genre: "" },
      { id: 2, title: "Zafar", artist: "La Vela Puerca", album: "A contraluz", year: 2001, genre: "" },
    ]);

    expect((await cliente.buscarCanciones("RUBEN candombe", 1)).canciones.map((c) => c.id)).toEqual([1]);
    expect((await cliente.buscarCanciones("contraluz", 1)).canciones.map((c) => c.id)).toEqual([2]);
    expect((await cliente.buscarCanciones("zzz", 1)).canciones).toEqual([]);
  });

  it("devuelve de a páginas y dice si hay más", async () => {
    const cliente = crearClienteDemo(async () => CATALOGO);

    const primera = await cliente.buscarCanciones("artista", 1);
    const tercera = await cliente.buscarCanciones("artista", 3);

    expect(primera.canciones).toHaveLength(20);
    expect(primera.hayMas).toBe(true);
    expect(tercera.canciones).toHaveLength(5);
    expect(tercera.hayMas).toBe(false);
  });
});
