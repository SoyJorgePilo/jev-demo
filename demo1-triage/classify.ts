/**
 * Demo 1 · Jev clasifica un ticket. Las preguntas están en questions.ts; los umbrales, en shared/thresholds.ts.
 * El "antes" (el mismo triage solo con Claude) está en llm.ts.
 */
import { askJev } from "../shared/jev.ts";
import { TICKET_QUESTIONS } from "./questions.ts";
import { decide, type Action } from "../shared/thresholds.ts";

export type Classification = {
  tipo: string; prioridad: string; equipo: string;
  confidence: { tipo: number; prioridad: number; equipo: number; min: number };
  needsHuman: number;
  action: Action;
  labels: string[];
  ms: number;
  inputTokens: number;
};

/** Un ticket: una llamada a Jev con las 4 preguntas de questions.ts, y tu código decide qué hacer. */
export async function classifyTicket(title: string, description: string, reporter = "desconocido"): Promise<Classification> {
  // 1. Jev responde las 4 preguntas con probabilidades
  const r = await askJev({ title, description, reporter }, TICKET_QUESTIONS);
  const { tipo, prioridad, equipo, needs_human } = r.answers;

  // 2. Tu código decide con la confianza más baja: aplica, marca o escala (shared/thresholds.ts)
  const min = Math.min(tipo.confidence, prioridad.confidence, equipo.confidence);
  const action = decide(min, needs_human.noul);

  // 3. Lo que se escribe en Jira
  const labels = ["jev", ...(action !== "apply" ? ["revisar"] : [])];
  return {
    tipo: tipo.choice, prioridad: prioridad.choice, equipo: equipo.choice,
    confidence: { tipo: tipo.confidence, prioridad: prioridad.confidence, equipo: equipo.confidence, min },
    needsHuman: needs_human.noul, action, labels, ms: r.ms, inputTokens: r.usage.input_tokens,
  };
}

/** Primera línea de cada comentario de Jev: `npm run limpiar` la usa para encontrarlos y borrarlos. */
export const COMMENT_PREFIX = "🤖 Triage automático";

/** El comentario que Jev deja en el ticket. Es lo que abres en el minuto 6–8. */
export function buildComment(c: Classification, model = process.env.JEV_MODEL ?? "jev-1.13.0") {
  const p = (n: number) => `${Math.round(n * 100)} %`;
  const actionText = { apply: "aplicado directo", apply_and_flag: "aplicado y marcado para revisión", escalate: "sin cambios; escalado a una persona" }[c.action];
  return [
    `${COMMENT_PREFIX} (${model}, ${c.ms} ms, ${c.inputTokens} tokens)`,
    `• Tipo: ${c.tipo} (${p(c.confidence.tipo)})`,
    `• Prioridad: ${c.prioridad} (${p(c.confidence.prioridad)})`,
    `• Equipo: ${c.equipo} (${p(c.confidence.equipo)})`,
    `• ¿Necesita revisión humana? ${p(c.needsHuman)}`,
    `Acción: ${actionText}.`,
  ].join("\n");
}
