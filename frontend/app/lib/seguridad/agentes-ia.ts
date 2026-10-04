/**
 * Rastreadores y agentes de IA que se identifican. El sitio es para personas: pueden leer la portada y nada más
 * (ver proxy.ts, que los frena en el resto, y robots.ts, que se lo pide a los que respetan ese archivo). Los que
 * se hacen pasar por un navegador común no se pueden detectar por el nombre: para eso está la comprobación humana.
 */
export const AGENTES_DE_IA = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "YouBot",
  "MistralAI-User",
  "DuckAssistBot",
  "Timpibot",
  "PanguBot",
  "Google-Extended",
  "GoogleOther",
];

const PATRON = new RegExp(AGENTES_DE_IA.map((nombre) => nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

export function esAgenteDeIA(agente: string | null | undefined): boolean {
  return !!agente && PATRON.test(agente);
}
