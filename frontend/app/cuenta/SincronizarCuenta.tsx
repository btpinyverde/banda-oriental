"use client";

import { useEffect, useRef } from "react";
import { crearApiCuenta, type ApiCuenta } from "../lib/cuenta/api-cuenta";
import { sincronizarHistorial } from "../lib/cuenta/sincronizar";
import { useSesion } from "../lib/cuenta/useSesion";

/**
 * No dibuja nada: cuando hay una sesión, trae el historial de la cuenta al dispositivo (una vez por sesión) y, si la
 * sesión ya no sirve, la cierra. Va en el layout para que valga en cualquier pantalla.
 */
export function SincronizarCuenta({ api }: { api?: ApiCuenta }) {
  const { sesion } = useSesion();
  const token = sesion?.token ?? null;
  const yaSincronizado = useRef<string | null>(null);

  useEffect(() => {
    if (!token || yaSincronizado.current === token) return;
    yaSincronizado.current = token;
    void sincronizarHistorial(api ?? crearApiCuenta(), token);
  }, [token, api]);

  return null;
}
