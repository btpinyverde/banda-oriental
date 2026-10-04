import Link from "next/link";
import type { Pagina, PaginaDeTexto, Seccion } from "../lib/paginas";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";
import "./pagina-contenido.css";

function Correo({ correo }: { correo?: string }) {
  if (!correo) {
    return <p className="contenido__correo">Estamos habilitando el correo de contacto; muy pronto lo vas a encontrar acá.</p>;
  }
  return (
    <p className="contenido__correo">
      Escribinos a <a href={`mailto:${correo}`}>{correo}</a>
    </p>
  );
}

function SeccionDeTexto({ seccion, correo }: { seccion: Seccion; correo?: string }) {
  return (
    <section className="contenido__seccion">
      <h2>{seccion.titulo}</h2>
      {seccion.parrafos?.map((parrafo) => (
        <p key={parrafo}>{parrafo}</p>
      ))}
      {seccion.lista && (
        <ul>
          {seccion.lista.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {seccion.correo && <Correo correo={correo} />}
    </section>
  );
}

function Texto({ pagina, correo }: { pagina: PaginaDeTexto; correo?: string }) {
  return (
    <>
      <header className="contenido__cabecera">
        <p className="contenido__eyebrow">{pagina.eyebrow}</p>
        <h1>{pagina.titulo}</h1>
        <p className="contenido__bajada">{pagina.bajada}</p>
        {pagina.preliminar && (
          <p className="contenido__aviso">Versión preliminar. Última actualización: {pagina.actualizada}.</p>
        )}
      </header>
      {pagina.secciones.map((seccion) => (
        <SeccionDeTexto key={seccion.titulo} seccion={seccion} correo={correo} />
      ))}
      <div className="contenido__acciones">
        <Link href="/jugar" className="boton boton--grande boton--violeta">
          Jugar el diario
        </Link>
      </div>
    </>
  );
}

function Proximamente({ pagina }: { pagina: Extract<Pagina, { tipo: "proximamente" }> }) {
  return (
    <>
      <header className="contenido__cabecera">
        <p className="contenido__eyebrow">PRÓXIMAMENTE</p>
        <h1>{pagina.titulo}</h1>
        <p className="contenido__bajada">{pagina.bajada}</p>
      </header>
      <section className="contenido__seccion">
        <p>{pagina.texto}</p>
      </section>
      <div className="contenido__acciones">
        <Link href="/" className="boton boton--grande boton--violeta">
          Volver al inicio
        </Link>
        <Link href="/jugar" className="boton boton--grande boton--claro">
          Jugar el diario
        </Link>
        {pagina.alternativa && (
          <Link href={pagina.alternativa.href} className="boton boton--grande boton--claro">
            {pagina.alternativa.etiqueta}
          </Link>
        )}
      </div>
    </>
  );
}

/**
 * Página informativa genérica: barra de navegación, cabecera, secciones de texto y pie. El contenido sale del
 * registro de app/lib/paginas.ts. Pensada para embellecerse después sin tocar los textos.
 */
export function PaginaDeContenido({ pagina, correo }: { pagina: Pagina; correo?: string }) {
  return (
    <>
      <Navbar actual={pagina.actual} />
      <main className="contenido">
        {pagina.tipo === "texto" ? <Texto pagina={pagina} correo={correo} /> : <Proximamente pagina={pagina} />}
      </main>
      <Footer variante="compacto" />
    </>
  );
}
