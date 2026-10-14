/**
 * Cliente de Jev (TypeSafe AI): una petición HTTP con fetch, sin SDK.
 *
 *   POST https://api.typesafe.ai/v1/systemone
 *   { model, state, questions }  →  { answers, usage }
 *
 *   state      los datos que Jev mira (un ticket, una función, una PR)
 *   questions  preguntas cerradas: Jev siempre elige una de las opciones que le das
 *   answers    una respuesta por pregunta, siempre con probabilidades
 *   usage      tokens; Jev solo cobra los de entrada
 */

const BASE_URL = process.env.JEV_BASE_URL ?? "https://api.typesafe.ai";
const MODEL = process.env.JEV_MODEL ?? "jev-1.13.0";

// ── 1. Las tres formas de preguntar ─────────────────────────────────────────────

/** Elegir una opción.     Vuelve { choice: "bug", confidence: 0.93, probabilities: { bug: 0.93, … } } */
export const choice = (instructions: string, criteria: Record<string, string | null>): ChoiceQuestion => ({ type: "choice", instructions, criteria });

/** Sí o no, en número.   Vuelve { noul: 0.82 }  (0 = no, 1 = sí) */
export const noul = (instructions: string, criteria?: { true: string; false: string }): NoulQuestion => ({ type: "noul", instructions, criteria });

/** Una escala 0, 1, 2…   Vuelve { score: 2.4, confidence, probabilities }  (cada nivel es un texto de criteria) */
export const score = (instructions: string, criteria: string[]): ScoreQuestion => ({ type: "score", instructions, criteria });

// ── 2. La llamada: una por ticket, función o PR, aunque lleve varias preguntas ──

export async function askJev<Q extends Record<string, Question>>(state: unknown, questions: Q): Promise<JevResult<Q>> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("Falta TYPESAFE_API_KEY en .env");

  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}/v1/systemone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, state, questions }), // sin `user`: la API responde 400 si se manda
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`);

  const data = await res.json(); // { answers, usage }
  return { ...data, ms: Math.round(performance.now() - t0) };
}

// ── 3. El costo: solo se cobran los tokens de entrada ──────────────────────────

export function jevCost(inputTokens: number, pricePerM = Number(process.env.JEV_PRICE_PER_M ?? 0.042)) {
  return (inputTokens / 1e6) * pricePerM;
}

// ── Tipos (para que TypeScript sepa qué respuesta trae cada pregunta) ──────────

export type ChoiceQuestion = { type: "choice"; instructions: string; criteria: Record<string, string | null> };
export type NoulQuestion = { type: "noul"; instructions: string; criteria?: { true: string; false: string } };
export type ScoreQuestion = { type: "score"; instructions: string; criteria: string[] };
export type Question = ChoiceQuestion | NoulQuestion | ScoreQuestion;

export type ChoiceAnswer = { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };
export type NoulAnswer = { type: "noul"; noul: number };
export type ScoreAnswer = { type: "score"; score: number; confidence: number; legend: Record<string, string>; probabilities: Record<string, number> };
export type Answer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

export type JevResult<Q extends Record<string, Question>> = {
  id?: string;
  model: string;
  answers: { [K in keyof Q]: Q[K] extends ChoiceQuestion ? ChoiceAnswer : Q[K] extends NoulQuestion ? NoulAnswer : ScoreAnswer };
  usage: { input_tokens: number; output_tokens: number };
  ms: number;
};
