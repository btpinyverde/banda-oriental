import type { Metadata } from "next";
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
