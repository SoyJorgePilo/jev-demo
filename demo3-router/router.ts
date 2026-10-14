/**
 * Demo 3 · Jev decide con qué se revisa cada PR. Las preguntas están en questions.ts; la ruta la elige routeFor()
 * en shared/thresholds.ts. La revisión con Claude o con reglas está en llm.ts.
 */
import { askJev } from "../shared/jev.ts";
import { PR_QUESTIONS } from "./questions.ts";
import { routeFor, type Route } from "../shared/thresholds.ts";

export type PR = {
  id: string; number?: number; url?: string; title: string; author?: string; mergedAt?: string;
  files: string[]; changedFiles?: number; additions: number; deletions: number; body?: string; diffSummary: string;
  expected?: string;
};

export type RouteDecision = {
  route: Route; reason: string;
  complejidad: string; confidence: number; touchesMoney: number;
  probabilities: Record<string, number>;
  jevMs: number; jevTokens: number;
};

/** Una PR: una llamada a Jev con las 2 preguntas de questions.ts, y tu código elige la ruta. */
export async function routePR(pr: PR): Promise<RouteDecision> {
  // 1. Jev responde las 2 preguntas con probabilidades
  const state = {
    title: pr.title,
    files: pr.files.slice(0, 25),
    changed_files: pr.changedFiles ?? pr.files.length,
    additions: pr.additions,
    deletions: pr.deletions,
    description: (pr.body ?? "").slice(0, 600),
    diff_summary: pr.diffSummary.slice(0, 3000),
  };
  const r = await askJev(state, PR_QUESTIONS);
  const complexity = r.answers.complejidad;
  const money = r.answers.touches_money.noul;

  // 2. Tu código elige la ruta: reglas, Haiku o Sonnet (routeFor en shared/thresholds.ts)
  const { route, reason } = routeFor(complexity.choice, complexity.confidence, money);

  return {
    route, reason,
    complejidad: complexity.choice, confidence: complexity.confidence, touchesMoney: money, probabilities: complexity.probabilities,
    jevMs: r.ms, jevTokens: r.usage.input_tokens,
  };
}
