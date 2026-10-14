/** Vaciado de results/ para repetir la demo. Lo usan `npm run reset` y `npm run limpiar`. */
import { rmSync, readdirSync, existsSync } from "node:fs";

// Las ejecuciones "direct" (todo al LLM, sin Jev) son el "antes" de cada demo: se precalculan una vez, tardan minutos y
// cuestan dinero, y no cambian entre ensayos. Por eso se conservan salvo que se pida lo contrario.
export const BASELINES = ["direct.json", "triage-direct.json", "code-health-direct.json"];

/** Borra todo results/ salvo los "antes" (si keepBaselines). Devuelve los que se conservaron. */
export function clearResults(keepBaselines = true): string[] {
  const keep = keepBaselines ? BASELINES : [];
  if (existsSync("results")) for (const f of readdirSync("results")) if (!keep.includes(f)) rmSync(`results/${f}`, { recursive: true, force: true });
  return keep.filter((f) => existsSync(`results/${f}`));
}
