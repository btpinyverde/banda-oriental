// frontend/app/jugar/page.tsx
import type { Metadata } from "next";
import { GameScreen } from "./GameScreen";

export const metadata: Metadata = {
  title: "Jugar — Banda Oriental",
  description: "Adiviná la canción uruguaya de hoy en seis intentos.",
};

export default function JugarPage() {
  return (
    <main>
      <GameScreen />
    </main>
  );
}
