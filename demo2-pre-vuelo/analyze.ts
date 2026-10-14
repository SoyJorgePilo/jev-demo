/**
 * Demo 2 · Jev revisa cada función del código que vas a tocar.
 * Las preguntas están en questions.ts; qué cuenta como marca lo decide flagsFrom() en shared/thresholds.ts.
 * Claude explica solo las marcadas (explain.ts). El comando que lo coordina todo es scan.ts.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { askJev } from "../shared/jev.ts";
import { flagsFrom, type Flag } from "../shared/thresholds.ts";
import { FUNCTION_QUESTIONS } from "./questions.ts";
import { cheapSignals, similarTo, type Fn } from "./split.ts";

export type Finding = {
  file: string; fn: Fn; signals: ReturnType<typeof cheapSignals>; answers: any;
  flags: Flag[]; severity: number; jevMs: number; jevTokens: number;
  explanation?: { model: string; text: string; input_tokens: number; output_tokens: number };
};

/** Lo que Jev mira de cada función: datos, señales baratas, las funciones parecidas y el código. */
function stateFor(file: string, fn: Fn, all: Fn[]) {
  const similar = similarTo(fn, all).map((s) => ({ name: s.name, lines: s.lines, head: s.source.split("\n").slice(0, 6).join("\n") }));
  return { file, function: fn.name, lines: fn.lines, params: fn.params, signals: cheapSignals(fn), similar_to: similar, source: fn.source.slice(0, 6000) };
}

/** Todas las funciones a Jev en paralelo, una llamada por función. */
export async function analyzeFunctions(all: { file: string; fn: Fn }[], { fresh = false } = {}) {
  const cache = loadCache(fresh);
  let reused = 0;
  const t0 = performance.now();

  const findings: Finding[] = await Promise.all(
    all.map(async ({ file, fn }) => {
      // 1. Jev responde las 6 preguntas con probabilidades
      const state = stateFor(file, fn, all.map((a) => a.fn));
      const key = createHash("sha1").update(JSON.stringify([state, FUNCTION_QUESTIONS, process.env.JEV_MODEL ?? ""])).digest("hex");
      const r = cache[key] ?? (await askJev(state, FUNCTION_QUESTIONS));
      if (cache[key]) reused++;
      else cache[key] = { answers: r.answers, ms: r.ms, usage: r.usage };

      // 2. Tu código decide qué cuenta como marca (shared/thresholds.ts)
      const flags = flagsFrom(r.answers);
      return { file, fn, signals: state.signals, answers: r.answers, flags, severity: r.answers.severidad.score, jevMs: r.ms, jevTokens: r.usage.input_tokens };
    })
  );

  saveCache(cache);
  // Si todo salió de la caché, el tiempo que cuenta es el del escaneo original (la llamada más lenta, en paralelo).
  const jevMs = reused === findings.length ? Math.max(...findings.map((f) => f.jevMs)) : Math.round(performance.now() - t0);
  return { findings, jevMs, reused };
}

// Caché de respuestas de Jev por función (results/.scan-cache.json): así `--explain` reutiliza lo que Jev dijo en el
// escaneo anterior y los números coinciden en pantalla. npm run reset la borra; --fresh la ignora.
const CACHE_FILE = "results/.scan-cache.json";
const loadCache = (fresh: boolean): Record<string, any> => (!fresh && existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : {});
const saveCache = (cache: Record<string, any>) => { mkdirSync("results", { recursive: true }); writeFileSync(CACHE_FILE, JSON.stringify(cache)); };
