import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { batallaActiva } from "../../lib/funciones";
import { Footer } from "../../ui/Footer";
import { Navbar } from "../../ui/Navbar";
import { Sala } from "../Sala";
import "../batalla.css";

export const metadata: Metadata = {
  title: "Batalla",
  // El enlace de una sala es privado de quienes lo reciben.
  robots: { index: false, follow: false },
};

export default async function PaginaSala({ params }: { params: Promise<{ code: string }> }) {
  if (!batallaActiva()) notFound();
  const { code } = await params;
  return (
    <>
      <Navbar actual="/batalla" />
      <Sala code={code} />
      <Footer variante="compacto" />
    </>
  );
}
