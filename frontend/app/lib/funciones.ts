/**
 * Interruptor del modo batalla (`NEXT_PUBLIC_BATALLA_ACTIVA=1`). Todavía no está resuelto, así que mientras esté
 * apagado no aparece nada de él: ni enlaces, ni tarjetas, ni la página, ni las menciones en los textos.
 * Se lee al compilar (las variables NEXT_PUBLIC_ quedan fijas en cada despliegue).
 */
export const batallaActiva = (): boolean => process.env.NEXT_PUBLIC_BATALLA_ACTIVA === "1";
