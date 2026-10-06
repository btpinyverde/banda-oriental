import type { Metadata } from "next";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import { FormularioDeContacto } from "./FormularioDeContacto";
import "./contacto.css";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Cómo comunicarte con el equipo de Banda Oriental: dudas, problemas, sugerencias y consultas de artistas y titulares.",
  alternates: { canonical: "/contacto" },
};

const PISTAS = [
  {
    texto: "Qué estabas haciendo cuando pasó.",
    icono: (
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="16" cy="16" r="11.5" />
        <path d="M16 8.5V16l5 3" />
      </svg>
    ),
  },
  {
    texto: "Desde qué dispositivo y navegador jugabas.",
    icono: (
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="5.5" width="25" height="17" rx="2.5" />
        <path d="M11 27.5h10M16 22.5v5" />
      </svg>
    ),
  },
  {
    texto: "Una captura de pantalla, si podés.",
    icono: (
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4.5" y="4.5" width="23" height="23" rx="6.5" />
        <circle cx="16" cy="16" r="5.5" />
        <circle cx="22.7" cy="9.3" r="0.9" fill="currentColor" />
      </svg>
    ),
  },
];

/** La página de contacto: "Hablemos.", el formulario, qué contar si algo no funciona y la consulta de artistas y titulares. */
export default function Contacto() {
  return (
    <>
      <Navbar />
      <main className="contacto">
        <div className="contacto__columna">
          <header className="contacto__cabecera">
            <p className="contacto__eyebrow">CONTACTO</p>
            <h1>
              <span className="contacto__resaltado">Hablemos.</span>
            </h1>
            <div className="contacto__dibujo" aria-hidden="true">
              <img className="contacto__mancha" src="/assets/hero-blob-pink.svg" alt="" />
              <img className="contacto__sobre" src="/assets/sobre.svg" alt="" />
              <img className="contacto__asterisco" src="/assets/brand-asterisk.svg" alt="" />
              <img className="contacto__garabato" src="/assets/jugar-garabato-bucle.svg" alt="" />
              <img className="contacto__rayas contacto__rayas--arriba" src="/assets/hero-rays-top.svg" alt="" />
              <img className="contacto__rayas contacto__rayas--sobre" src="/assets/hero-rays-left.svg" alt="" />
            </div>
            <div className="contacto__bajada">
              <p className="contacto__lema">¿Una duda, un problema o una idea?<br />Nos encanta leerte.</p>
              <p className="contacto__detalle">Completá el formulario y te vamos a responder lo antes posible.</p>
            </div>
          </header>

          <section className="contacto__tarjeta contacto__tarjeta--lila" aria-labelledby="contacto-pistas">
            <h2 id="contacto-pistas">Si algo no funciona</h2>
            <p>Para poder ayudarte rápido, contanos:</p>
            <ul className="contacto__pistas">
              {PISTAS.map(({ texto, icono }) => (
                <li key={texto}>
                  <span className="contacto__icono">{icono}</span>
                  <span>{texto}</span>
                </li>
              ))}
            </ul>
            <img className="contacto__rayas contacto__rayas--tarjeta" src="/assets/doodle-rays.svg" alt="" aria-hidden="true" />
          </section>
        </div>

        <div className="contacto__columna">
          <div className="contacto__formulario">
            <FormularioDeContacto />
          </div>

          <section className="contacto__tarjeta contacto__tarjeta--amarilla" aria-labelledby="contacto-artistas">
            <img className="contacto__personaje" src="/assets/art-personaje-gorra.svg" alt="" aria-hidden="true" />
            <img className="contacto__rayas--personaje" src="/assets/hero-rays-left.svg" alt="" aria-hidden="true" />
            <img className="contacto__rayas--amarilla" src="/assets/hero-rays-top.svg" alt="" aria-hidden="true" />
            <div>
              <h2 id="contacto-artistas">Artistas y titulares de derechos</h2>
              <p>Si sos artista o titular de derechos y tenés una consulta sobre una canción del juego, escribinos y la vemos con atención.</p>
            </div>
          </section>
        </div>
      </main>
      <Footer variante="compacto" />
    </>
  );
}
