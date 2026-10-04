import type { Metadata } from "next";
import { cuentasActivas } from "../../lib/cuenta/activas";
import { PAGINA_CUENTAS_PROXIMAMENTE } from "../../lib/paginas";
import { PaginaDeContenido } from "../../ui/PaginaDeContenido";
import { Footer } from "../../ui/Footer";
import { Navbar } from "../../ui/Navbar";
import { EntrarConEnlace } from "./EntrarConEnlace";
import "../cuenta.css";

export const metadata: Metadata = {
  title: "Entrar con el enlace del correo",
  robots: { index: false, follow: false },
  // La dirección lleva el token en el fragmento; igual no hay por qué mandar nada a otros sitios.
  referrer: "no-referrer",
};

export default function PaginaEntrar() {
  if (!cuentasActivas()) return <PaginaDeContenido pagina={PAGINA_CUENTAS_PROXIMAMENTE} />;

  return (
    <>
      <Navbar />
      <main className="cuenta">
        <header className="cuenta__cabecera">
          <h1>Tu enlace</h1>
        </header>
        <EntrarConEnlace />
      </main>
      <Footer variante="compacto" />
    </>
  );
}
