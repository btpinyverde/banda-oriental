import { Ondulada } from "./Ondulada";

/**
 * Sección "Cómo se juega". Las maquetas de cada paso (reproductor, stems, buscador,
 * trofeo) son ilustraciones decorativas: no son interactivas.
 */
export function ComoSeJuega() {
  return (
    <section className="como" id="como-se-juega" aria-labelledby="como-titulo">
      <Ondulada className="como__ondulada" trazo="corta" />

      <div className="como__cabecera">
        <p className="como__eyebrow">Cómo se juega</p>
        <h2 className="como__titulo" id="como-titulo">
          Es si<span className="resaltado">mple.</span>
        </h2>
        <p className="como__bajada">Escuchá, pensá y elegí. Cada intento te acerca un poco más a la canción.</p>
      </div>

      <ol className="como__pasos">
        <li className="paso paso--escucha">
          <img className="como__mancha" src="/assets/como-blob-lilac.svg" alt="" aria-hidden="true" />
          <span className="paso__numero" aria-hidden="true">1</span>
          <div className="paso__texto">
            <h3>Escuchá</h3>
            <p>Reproducimos un fragmento de la canción del día.</p>
          </div>
          <div className="paso__demo" aria-hidden="true">
            <img className="como__rayas como__rayas--paso1" src="/assets/hero-rays-top.svg" alt="" />
            <div className="maqueta-player">
              <span className="maqueta-player__play">
                <img src="/assets/play.svg" alt="" />
              </span>
              <img className="maqueta-player__onda" src="/assets/waveform.svg" alt="" />
              <span className="maqueta-player__tiempo">0:30</span>
            </div>
          </div>
          <img className="paso__flecha" src="/assets/arrow-step.svg" alt="" aria-hidden="true" />
        </li>

        <li className="paso paso--piensa">
          <span className="paso__numero" aria-hidden="true">2</span>
          <div className="paso__texto">
            <h3>Pensá</h3>
            <p>Con cada intento se desbloquea una nueva pista.</p>
          </div>
          <div className="paso__demo" aria-hidden="true">
            <img className="como__rayas como__rayas--paso2" src="/assets/hero-rays-claim.svg" alt="" />
            <ul className="maqueta-stems">
              <li>
                <span className="maqueta-stems__circulo maqueta-stems__circulo--menta">
                  <img src="/assets/icon-drums.svg" alt="" />
                </span>
                Batería
              </li>
              <li>
                <span className="maqueta-stems__circulo maqueta-stems__circulo--rosa">
                  <img src="/assets/icon-bass.svg" alt="" />
                </span>
                Bajo
              </li>
              <li>
                <span className="maqueta-stems__circulo maqueta-stems__circulo--lavanda">
                  <img src="/assets/icon-voice.svg" alt="" />
                </span>
                Voz
              </li>
              <li>
                <span className="maqueta-stems__circulo maqueta-stems__circulo--gris">
                  <img src="/assets/lock.svg" alt="" />
                </span>
                Otros
              </li>
            </ul>
          </div>
          <img className="paso__flecha" src="/assets/arrow-step.svg" alt="" aria-hidden="true" />
        </li>

        <li className="paso paso--elegi">
          <span className="paso__numero" aria-hidden="true">3</span>
          <div className="paso__texto">
            <h3>Elegí</h3>
            <p>Buscá entre el archivo y hacé tu intento.</p>
          </div>
          <div className="paso__demo" aria-hidden="true">
            <img className="como__rayas como__rayas--paso3" src="/assets/hero-rays-top.svg" alt="" />
            <div className="maqueta-buscador">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m20 20-4.5-4.5" />
              </svg>
              Escribí un artista o canción...
            </div>
            <ul className="maqueta-resultados">
              <li>No Te Va Gustar</li>
              <li>Jorge Drexler</li>
              <li>La Vela Puerca</li>
            </ul>
          </div>
          <img className="paso__flecha" src="/assets/arrow-step.svg" alt="" aria-hidden="true" />
        </li>

        <li className="paso paso--descubri">
          <span className="paso__numero" aria-hidden="true">4</span>
          <div className="paso__texto">
            <h3>Descubrí</h3>
            <p>Si acertás, sumás puntos y seguís. Si no, hay otra pista.</p>
          </div>
          <div className="paso__demo" aria-hidden="true">
            <img className="como__rayas como__rayas--paso4-izq" src="/assets/hero-rays-claim.svg" alt="" />
            <img className="como__rayas como__rayas--paso4-der" src="/assets/hero-rays-top.svg" alt="" />
            <div className="maqueta-premios">
              <span className="maqueta-premios__nota">
                <img src="/assets/icon-note.svg" alt="" />
              </span>
              <span className="maqueta-premios__trofeo">
                <img src="/assets/icon-trophy.svg" alt="" />
              </span>
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}
