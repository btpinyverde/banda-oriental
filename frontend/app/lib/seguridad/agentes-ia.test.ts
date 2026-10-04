import { describe, expect, it } from "vitest";
import { AGENTES_DE_IA, esAgenteDeIA } from "./agentes-ia";

describe("esAgenteDeIA", () => {
  it.each([
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)",
    "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
    "Mozilla/5.0 (compatible; OAI-SearchBot/1.0)",
    "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Claude-User/1.0",
    "anthropic-ai",
    "Mozilla/5.0 (compatible; PerplexityBot/1.0)",
    "CCBot/2.0 (https://commoncrawl.org/faq/)",
    "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
    "Mozilla/5.0 (compatible; Amazonbot/0.1)",
    "Mozilla/5.0 (compatible; Google-Extended)",
    "gptbot",
  ])("reconoce %s", (agente) => {
    expect(esAgenteDeIA(agente)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
    "",
  ])("deja pasar a personas y a buscadores comunes: %s", (agente) => {
    expect(esAgenteDeIA(agente)).toBe(false);
  });

  it("sin cabecera tampoco lo trata como IA (no se puede saber)", () => {
    expect(esAgenteDeIA(null)).toBe(false);
    expect(esAgenteDeIA(undefined)).toBe(false);
  });

  it("la lista para robots.txt coincide con lo que se bloquea", () => {
    for (const nombre of AGENTES_DE_IA) expect(esAgenteDeIA(`Mozilla/5.0 (compatible; ${nombre}/1.0)`)).toBe(true);
  });
});
