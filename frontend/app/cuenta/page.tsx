import type { Metadata } from "next";
import { cuentasActivas } from "../lib/cuenta/activas";
import { PAGINA_CUENTAS_PROXIMAMENTE } from "../lib/paginas";
import { PaginaDeContenido } from "../ui/PaginaDeContenido";
import { Footer } from "../ui/Footer";
import { Navbar } from "../ui/Navbar";
import { PanelCuenta } from "./PanelCuenta";
import "./cuenta.css";

export const metadata: Metadata = {
  title: "Mi cuenta",
  description: "Tu cuenta de Banda Oriental.",
  robots: { index: false, follow: false },
};

export default function PaginaCuenta() {
  if (!cuentasActivas()) return <PaginaDeContenido pagina={PAGINA_CUENTAS_PROXIMAMENTE} />;

  return (
    <>
      <Navbar />
      <main className="cuenta">
        <header className="cuenta__cabecera">
          <h1>Mi cuenta</h1>
        </header>
        <PanelCuenta />
      </main>
      <Footer variante="compacto" />
    </>
  );
}
