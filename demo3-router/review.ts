/**
 * Demo 3 · El comando: revisa el lote de PRs en dos modos y guarda results/<mode>.json.
 *   Jev: questions.ts (qué se pregunta) · router.ts (la llamada por PR) · routeFor() en shared/thresholds.ts
 *   Claude: llm.ts (la revisión, o reglas sin LLM si es trivial)
 *
 *   npm run review -- --mode=direct   → todas las PRs al modelo grande
 *   npm run review -- --mode=jev      → Jev decide la ruta por PR
 *   opciones: --data=data/prs-fork.json (default) · --concurrency=3
 *             --comment  → deja el veredicto del router como comentario en cada PR (sesión de gh y PRs en tu fork)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { routePR, type PR, type RouteDecision } from "./router.ts";
import { reviewPR, modelFor, type Review } from "./llm.ts";
import { mapLimit } from "../shared/prices.ts";
import { bold, dim, green, yellow, cyan, gray, magenta, colorRoute } from "../shared/ui.ts";
import { commentOnPR, routerComment } from "../shared/github.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const MODE = (arg("mode") ?? "jev") as "direct" | "jev";
const DATA = arg("data") ?? "data/prs-fork.json";
const CONCURRENCY = Number(arg("concurrency") ?? 3);
const COMMENT = process.argv.includes("--comment");

const raw = JSON.parse(readFileSync(DATA, "utf8"));
const prs: PR[] = Array.isArray(raw) ? raw : raw.prs;
const repo: string = Array.isArray(raw) ? "sintético" : raw.repo;

export type Result = { pr: Pick<PR, "id" | "number" | "url" | "title" | "additions" | "deletions" | "expected">; mode: string; route: string; model: string; decision?: RouteDecision; review: Review };

console.log(bold(`\nRevisión de ${prs.length} PRs · modo ${MODE === "direct" ? magenta("direct") : green("jev")}`), dim(`· ${repo}\n`));

const results: Result[] = [];
const t0 = performance.now();

async function one(pr: PR) {
  let decision: RouteDecision | undefined;
  let route: "rules" | "haiku" | "sonnet" = "sonnet";
  if (MODE === "jev") {
    decision = await routePR(pr);
    route = decision.route;
    console.log(
      `${cyan(pr.id.padEnd(9))} ${bold(decision.complejidad.padEnd(7))} ${String(Math.round(decision.confidence * 100)).padStart(3)} %  dinero ${String(Math.round(decision.touchesMoney * 100)).padStart(3)} %  → ${colorRoute(route)}${" ".repeat(6 - route.length)} ${gray(`${decision.jevMs} ms`)}  ${dim(pr.title.slice(0, 58))}`
    );
  }
  const review = await reviewPR(pr, route);
  if (COMMENT && MODE === "jev" && decision) {
    const r = await commentOnPR(pr.url, routerComment(decision, review));
    if (r !== "ok" && r !== "skipped") console.log(yellow(`  ⚠ comentario en ${pr.id}: ${r}`));
    else if (r === "ok") console.log(gray(`  💬 comentario publicado en ${pr.url}`));
  }
  if (MODE === "direct") console.log(`${cyan(pr.id.padEnd(9))} → ${magenta("sonnet")} ${gray(`${review.input_tokens} in / ${review.output_tokens} out · ${review.ms} ms`)}  ${dim(pr.title.slice(0, 58))}`);
  results.push({ pr: { id: pr.id, number: pr.number, url: pr.url, title: pr.title, additions: pr.additions, deletions: pr.deletions, expected: pr.expected }, mode: MODE, route, model: modelFor(route), decision, review });
}

// Concurrencia acotada: el cuello son las llamadas al LLM, no Jev
await mapLimit(prs, CONCURRENCY, one);
results.sort((a, b) => prs.findIndex((p) => p.id === a.pr.id) - prs.findIndex((p) => p.id === b.pr.id));

const totalMs = Math.round(performance.now() - t0);
const sum = (f: (r: Result) => number) => results.reduce((s, r) => s + f(r), 0);
const byRoute = results.reduce<Record<string, number>>((m, r) => ((m[r.route] = (m[r.route] ?? 0) + 1), m), {});

console.log(`
${bold("Resumen")}  ${MODE}
  PRs            ${results.length}   rutas: ${Object.entries(byRoute).map(([r, n]) => `${colorRoute(r)} ${n}`).join(" · ")}
  Tokens LLM     ${sum((r) => r.review.input_tokens).toLocaleString()} in / ${sum((r) => r.review.output_tokens).toLocaleString()} out
  Tokens Jev     ${sum((r) => r.decision?.jevTokens ?? 0).toLocaleString()}
  Tiempo         ${(totalMs / 1000).toFixed(1)} s
`);

mkdirSync("results", { recursive: true });
const OUT = `results/${MODE}.json`;
writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), mode: MODE, data: DATA, repo, totalMs, results }, null, 2));
console.log(dim(`→ ${OUT}`));
