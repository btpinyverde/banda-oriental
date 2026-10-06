/**
 * Interruptor del modo batalla: se muestra en la landing, la barra, el pie y el ranking salvo que se apague con
 * `NEXT_PUBLIC_BATALLA_ACTIVA=0` (cualquier otro valor, o ninguno, lo deja prendido). Esto solo decide si se *ve*: quién puede
 * crear salas lo decide siempre el servidor (`BATTLE_CREATOR_EMAILS`), y entrar a una sala con su enlace está abierto.
 * Se lee al compilar (las variables NEXT_PUBLIC_ quedan fijas en cada despliegue).
 */
export const batallaActiva = (): boolean => process.env.NEXT_PUBLIC_BATALLA_ACTIVA !== "0";
