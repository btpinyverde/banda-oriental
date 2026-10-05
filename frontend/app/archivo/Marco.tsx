import type { ReactNode } from "react";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import "./archivo-musical.css";

/** El marco de todas las páginas del archivo de música: barra del sitio, contenido y pie. `ancho` es para el explorador de canciones. */
export function Marco({ children, ancho = false }: { children: ReactNode; ancho?: boolean }) {
  return (
    <>
      <Navbar actual="/archivo" />
      <main className={`archivo-musical${ancho ? " archivo-musical--ancho" : ""}`}>{children}</main>
      <Footer variante="compacto" />
    </>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="archivo-aviso" role="alert">
      <p>{children}</p>
    </div>
  );
}
