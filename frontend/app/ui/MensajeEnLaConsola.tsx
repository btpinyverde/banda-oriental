"use client";

import { useEffect } from "react";

let mostrado = false;

/**
 * Para quien abre la consola del navegador a ver qué hay detrás del sitio: la pregunta de siempre (la frase que se le
 * atribuye a Isabel "la Coca" Sarli) y una invitación a mandar sugerencias. Se muestra una sola vez por carga de la
 * página y no dibuja nada.
 */
export function MensajeEnLaConsola() {
  useEffect(() => {
    if (mostrado) return;
    mostrado = true;
    console.log("%c¿Qué pretende usted de mí?", "font: 800 28px 'Helvetica Neue', Arial, sans-serif; color: #6c4ff0;");
    console.log("Banda Oriental, el juego de la música uruguaya. Si venís a curiosear, bienvenida o bienvenido.");
    console.log("¿Se te ocurre algo que mejorar o una canción que falta? Escribinos en /sugerencias.");
  }, []);

  return null;
}
