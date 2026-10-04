/**
 * Interruptor de las cuentas (`NEXT_PUBLIC_CUENTAS_ACTIVAS=1`). Se prende junto con el correo del backend: sin correo
 * nadie podría confirmar su cuenta ni recuperarla, así que mientras tanto /login sigue diciendo "próximamente".
 * Se lee al compilar (las variables NEXT_PUBLIC_ quedan fijas en cada despliegue).
 */
export const cuentasActivas = (): boolean => process.env.NEXT_PUBLIC_CUENTAS_ACTIVAS === "1";
