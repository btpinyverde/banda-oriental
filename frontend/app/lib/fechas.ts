/** Fechas en español, como se escriben en Uruguay: días y meses en minúscula. Recibe "2026-10-03". */
const formato = (opciones: Intl.DateTimeFormatOptions, dia: string) =>
  new Intl.DateTimeFormat("es-UY", { ...opciones, timeZone: "UTC" }).format(new Date(`${dia}T00:00:00Z`)).toLowerCase();

export const nombreDelDia = (dia: string) => formato({ weekday: "long" }, dia);
export const nombreDelMes = (dia: string) => formato({ month: "long" }, dia);

/** "3 de octubre" */
export const diaYMes = (dia: string) => `${Number(dia.slice(8, 10))} de ${nombreDelMes(dia)}`;
/** "viernes 2 de octubre de 2026" */
export const fechaLarga = (dia: string) => `${nombreDelDia(dia)} ${diaYMes(dia)} de ${dia.slice(0, 4)}`;
/** "octubre de 2026" */
export const mesYAnio = (dia: string) => `${nombreDelMes(dia)} de ${dia.slice(0, 4)}`;
