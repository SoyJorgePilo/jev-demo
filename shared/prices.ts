/** Precios por millón de tokens (shared/prices.json) y costo en USD de una llamada. */
import { readFileSync } from "node:fs";

const PRICES: Record<string, { input_per_m: number; output_per_m: number }> = JSON.parse(readFileSync("shared/prices.json", "utf8"));

/** Precio de un modelo; uno que no esté en prices.json cuenta como gratis. */
export const price = (model: string) => PRICES[model] ?? { input_per_m: 0, output_per_m: 0 };
export const llmCost = (model: string, inputTokens: number, outputTokens: number) => (inputTokens / 1e6) * price(model).input_per_m + (outputTokens / 1e6) * price(model).output_per_m;

/** Corre fn sobre items con como máximo `limit` llamadas a la vez. Con CLAUDE_ENGINE=cli cada llamada es un proceso `claude -p`. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}
