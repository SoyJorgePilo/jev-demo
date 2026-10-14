/**
 * Demo 1 · El "antes": el mismo triage solo con un LLM, sin Jev (npm run batch -- --mode=direct).
 *
 * Así se hace hoy con IA: un prompt a Sonnet que pide la clasificación en JSON. Para que la comparación sea justa,
 * el prompt lleva exactamente las mismas opciones y descripciones que las preguntas a Jev (TICKET_QUESTIONS).
 * La diferencia que importa en la demo: el LLM devuelve una respuesta, no una probabilidad. No hay confianza que
 * comparar con un umbral, así que tu código solo puede aplicar o escalar si el propio LLM dice que necesita humano.
 */
import { callClaude } from "../shared/claude.ts";
import { type Action } from "../shared/thresholds.ts";
import { TICKET_QUESTIONS } from "./questions.ts";

const DIRECT_MODEL = process.env.MODEL_LARGE ?? "claude-sonnet-5-5";

export type DirectClassification = {
  tipo: string; prioridad: string; equipo: string; needsHuman: boolean;
  action: Action;
  model: string; input_tokens: number; output_tokens: number; ms: number;
  error?: string;
};

/** Las opciones de una pregunta de Jev como líneas de texto para el prompt: "- bug: Algo que antes funcionaba…". */
const options = (q: { criteria?: Record<string, string | null> }) => Object.entries(q.criteria ?? {}).map(([k, v]) => `  - ${k}: ${v}`).join("\n");

export const directTicketPrompt = (title: string, description: string, reporter: string) => `Clasifica este ticket de soporte de una tienda en línea. Responde SOLO con un objeto JSON, sin texto antes ni después:
{"tipo": "...", "prioridad": "...", "equipo": "...", "needs_human": true|false}

tipo — ${TICKET_QUESTIONS.tipo.instructions}
${options(TICKET_QUESTIONS.tipo)}
prioridad — ${TICKET_QUESTIONS.prioridad.instructions}
${options(TICKET_QUESTIONS.prioridad)}
equipo — ${TICKET_QUESTIONS.equipo.instructions}
${options(TICKET_QUESTIONS.equipo)}
needs_human — ${TICKET_QUESTIONS.needs_human.instructions}
${options(TICKET_QUESTIONS.needs_human)}

Ticket:
Título: ${title}
Descripción: ${description}
Reportado por: ${reporter}`;

/**
 * Lee la respuesta del LLM. Tolera texto alrededor o un bloque ```json; si falta un campo o trae una opción que no
 * existe, lo devuelve como error: un LLM no garantiza el formato, Jev sí (siempre elige una de las opciones).
 */
export function parseDirectTicket(text: string): Pick<DirectClassification, "tipo" | "prioridad" | "equipo" | "needsHuman"> {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("la respuesta no trae JSON");
  const d = JSON.parse(json);
  for (const k of ["tipo", "prioridad", "equipo"] as const) {
    const valid = Object.keys(TICKET_QUESTIONS[k].criteria);
    if (!valid.includes(d[k])) throw new Error(`${k} inválido: ${JSON.stringify(d[k])}`);
  }
  return { tipo: d.tipo, prioridad: d.prioridad, equipo: d.equipo, needsHuman: d.needs_human === true || d.needs_human === "true" };
}

export async function classifyTicketDirect(title: string, description: string, reporter = "desconocido"): Promise<DirectClassification> {
  const prompt = directTicketPrompt(title, description, reporter);
  const t0 = performance.now();
  const out = await callClaude(DIRECT_MODEL, prompt, 200);
  const base = { model: out.model, input_tokens: out.input_tokens, output_tokens: out.output_tokens, ms: Math.round(performance.now() - t0) };
  try {
    const c = parseDirectTicket(out.text);
    // Sin probabilidades no hay "aplicar y marcar para revisión": o confías en la respuesta o la escalas.
    return { ...c, action: c.needsHuman ? "escalate" : "apply", ...base };
  } catch (e: any) {
    return { tipo: "?", prioridad: "?", equipo: "?", needsHuman: true, action: "escalate", error: e.message, ...base };
  }
}
