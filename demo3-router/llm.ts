/**
 * Demo 3 · Claude revisa la PR (Haiku o Sonnet, vía shared/claude.ts) o, si es trivial, las reglas locales sin LLM.
 * En el "antes" todas las PRs pasan por aquí con Sonnet; con Jev, router.ts elige la ruta antes.
 */
import type { PR } from "./router.ts";
import type { Route } from "../shared/thresholds.ts";
import { callClaude } from "../shared/claude.ts";

export type Review = { model: string; text: string; input_tokens: number; output_tokens: number; ms: number };

const MODEL_SMALL = process.env.MODEL_SMALL ?? "claude-haiku-4-5";
const MODEL_LARGE = process.env.MODEL_LARGE ?? "claude-sonnet-5-5";

export const modelFor = (route: Route) => (route === "haiku" ? MODEL_SMALL : route === "sonnet" ? MODEL_LARGE : "rules");

const PROMPT = (pr: PR) => `Eres un revisor de código senior. Revisa esta pull request y responde en español, en máximo 180 palabras:
1) Riesgo principal (o "ninguno relevante").
2) Hasta 3 observaciones concretas con archivo.
3) Veredicto: aprobar / aprobar con cambios / pedir cambios.

Título: ${pr.title}
Archivos (${pr.changedFiles ?? pr.files.length}): ${pr.files.join(", ")}
+${pr.additions} / -${pr.deletions}
Descripción: ${(pr.body ?? "").slice(0, 800) || "(sin descripción)"}

Diff (recortado):
${pr.diffSummary}`;

export async function reviewPR(pr: PR, route: Route): Promise<Review> {
  const t0 = performance.now();
  if (route === "rules") return { ...rulesReview(pr), ms: Math.round(performance.now() - t0) };

  const out = await callClaude(modelFor(route), PROMPT(pr), 600);
  return { ...out, ms: Math.round(performance.now() - t0) };
}

/** Ruta "rules": checklist local. Cero tokens. */
export function rulesReview(pr: PR): Omit<Review, "ms"> {
  const checks = [
    [`Tiene descripción`, Boolean(pr.body && pr.body.length > 20)],
    [`Tamaño pequeño (≤ 100 líneas)`, pr.additions + pr.deletions <= 100],
    [`No toca archivos sensibles`, !pr.files.some((f) => /payment|refund|auth|session|migration|\.env|secret/i.test(f))],
    [`Sin console.log en el diff`, !/\+.*console\.log/.test(pr.diffSummary)],
    [`Sin TODO/FIXME nuevos`, !/\+.*(TODO|FIXME)/.test(pr.diffSummary)],
  ] as const;
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  const text = [
    `Checklist automático (sin LLM):`,
    ...checks.map(([n, ok]) => `  ${ok ? "✓" : "✗"} ${n}`),
    failed.length ? `Veredicto: aprobar con cambios (${failed.length} punto(s)).` : `Veredicto: aprobar.`,
  ].join("\n");
  return { model: "rules", text, input_tokens: 0, output_tokens: 0 };
}
