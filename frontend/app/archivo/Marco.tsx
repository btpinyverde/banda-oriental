import type { ReactNode } from "react";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import "./archivo-musical.css";

/** El marco de todas las páginas del archivo de música: barra del sitio, contenido y pie. */
export function Marco({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar actual="/archivo" />
      <main className="archivo-musical">{children}</main>
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
