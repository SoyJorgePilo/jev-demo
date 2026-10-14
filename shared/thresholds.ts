/**
 * Lo que decide tu código con las probabilidades de Jev. Un bloque por demo: los umbrales y la función que los usa.
 *
 *   Jev responde (questions.ts de cada demo)  →  aquí se decide qué hacer
 *
 * Son números tuyos, no del modelo: están versionados y cubiertos por pruebas (tests/thresholds.test.ts).
 * Cada uno se puede mover sin tocar código con su variable en .env (THRESHOLD_APPLY, SCAN_THRESHOLD…).
 */

// ── Demo 1 · Triage: aplicar, aplicar y marcar, o escalar ──────────────────────

export type Action = "apply" | "apply_and_flag" | "escalate";

export const THRESHOLDS = {
  apply: Number(process.env.THRESHOLD_APPLY ?? 0.7),      // ≥ aplica directo
  flag: Number(process.env.THRESHOLD_FLAG ?? 0.5),        // ≥ aplica y etiqueta "revisar" (bajo esto: escala, etiqueta "escalado")
  needsHuman: Number(process.env.THRESHOLD_HUMAN ?? 0.5), // Jev dice que falta info
};

/** confidence: la más baja de tipo, prioridad y equipo. needsHuman: la probabilidad de que haga falta una persona. */
export function decide(confidence: number, needsHuman: number, t = THRESHOLDS): Action {
  if (needsHuman >= t.needsHuman) return "escalate";
  if (confidence >= t.apply) return "apply";
  if (confidence >= t.flag) return "apply_and_flag";
  return "escalate";
}

// ── Demo 2 · Pre-vuelo: qué cuenta como marca en una función ───────────────────

export const SCAN = {
  flag: Number(process.env.SCAN_THRESHOLD ?? 0.6), // ≥ la señal cuenta como marca y la función va a Claude
};

export type Flag = { key: string; p: number };

/** Las respuestas de Jev a las preguntas de demo2-pre-vuelo/questions.ts que pueden marcar una función. */
type FunctionAnswers = {
  responsabilidades: { choice: string; confidence: number };
  oculta_errores: { noul: number }; muta_entrada: { noul: number }; numero_magico: { noul: number }; logica_duplicada: { noul: number };
};

export function flagsFrom(a: FunctionAnswers, s = SCAN): Flag[] {
  const flags: Flag[] = [];
  if (a.responsabilidades.choice === "varias" && a.responsabilidades.confidence >= s.flag) {
    flags.push({ key: "varias_responsabilidades", p: a.responsabilidades.confidence });
  }
  for (const k of ["oculta_errores", "muta_entrada", "numero_magico", "logica_duplicada"] as const) {
    if (a[k].noul >= s.flag) flags.push({ key: k, p: a[k].noul });
  }
  return flags;
}

// ── Demo 3 · Router: reglas, Haiku o Sonnet ─────────────────────────────────────

export type Route = "rules" | "haiku" | "sonnet";

export const ROUTER = {
  moneyThreshold: Number(process.env.ROUTER_MONEY_THRESHOLD ?? 0.5), // ≥ toca dinero: siempre al modelo grande
  minConfidence: Number(process.env.ROUTER_MIN_CONFIDENCE ?? 0.6),   // < ante la duda, al modelo grande
};

/** En este orden: primero el dinero, luego la duda, y solo entonces la complejidad. */
export function routeFor(complexity: string, confidence: number, touchesMoney: number, r = ROUTER): { route: Route; reason: string } {
  if (touchesMoney >= r.moneyThreshold) return { route: "sonnet", reason: `toca dinero (${pct(touchesMoney)})` };
  if (confidence < r.minConfidence) return { route: "sonnet", reason: `confianza baja (${pct(confidence)})` };
  if (complexity === "trivial") return { route: "rules", reason: "trivial → reglas sin LLM" };
  if (complexity === "media") return { route: "haiku", reason: "media → modelo pequeño" };
  return { route: "sonnet", reason: "alta → modelo grande" };
}

export const pct = (n: number) => `${Math.round(n * 100)} %`;
