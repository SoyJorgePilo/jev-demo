/**
 * Demo 1 · El comando del lote: lee data/tickets.json, (opcional) crea los issues en Jira, los clasifica en paralelo con Jev
 * y aplica umbrales. Imprime tabla y totales.
 *   Jev: questions.ts (qué se pregunta) · classify.ts (la llamada por ticket) · decide() en shared/thresholds.ts
 *   Claude: llm.ts (el "antes", --mode=direct) · Jira: jira.ts
 *
 *
 * npm run batch                 → crea los 30 en Jira y los clasifica
 * npm run batch -- --no-create  → los tickets ya existen (los importaste por CSV); solo clasifica los que tengan etiqueta "batch"
 * npm run batch -- --mode=direct → el "antes": Sonnet clasifica los 22 issues reales de KAN, sin Jev; lee Jira pero no escribe (se precalcula)
 * npm run batch -- --data=data/tickets.json
 * npm run batch -- --review=data/humanreview.json   → criterios humanos por key de Jira (columna "vs esperado")
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifyTicket, buildComment, type Classification } from "./classify.ts";
import { classifyTicketDirect } from "./llm.ts";
import { createIssue, applyClassification, addComment, searchIssues, adfToText, projectKey } from "./jira.ts";
import { jevCost } from "../shared/jev.ts";
import { llmCost, mapLimit } from "../shared/prices.ts";
import { table, bold, dim, green, yellow, red, cyan, gray, magenta, usd, num, colorAction } from "../shared/ui.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DATA = arg("data") ?? "data/tickets.json";
const NO_CREATE = process.argv.includes("--no-create");
const MODE = (arg("mode") ?? "jev") as "jev" | "direct";
const REVIEW = arg("review") ?? "data/humanreview.json";

type Ticket = { id: string; title: string; description: string; reporter?: string };
const tickets: Ticket[] = JSON.parse(readFileSync(DATA, "utf8"));

// Criterios de la revisión humana: se buscan por key de Jira y, si tu tablero tiene otras keys, por título.
type Criterion = { id: string; title?: string; expected?: Record<string, string | null>; ambiguous?: boolean };
const reviewList = JSON.parse(readFileSync(REVIEW, "utf8")) as Criterion[];
const byKey = new Map(reviewList.map((c) => [c.id, c]));
const byTitle = new Map(reviewList.filter((c) => c.title).map((c) => [c.title!.trim().toLowerCase(), c]));
const criterionFor = (key: string, title: string) => byKey.get(key) ?? byTitle.get(title.trim().toLowerCase());

/** Los issues de KAN con etiqueta batch que no están en Finalizada: los 22 que se clasifican en la demo. */
async function pendingIssues() {
  const found = await searchIssues(`project = ${projectKey} AND labels = batch AND statusCategory != Done ORDER BY created ASC`, 200, ["summary", "description"]);
  // Emparejamos por título, no por orden: los tickets movidos a Listo (seed --done) descuadrarían el orden.
  // De tickets.json solo se toma el reporter.
  const norm = (s: string) => s.trim().toLowerCase();
  return found.flatMap((f) => {
    const t = tickets.find((x) => norm(x.title) === norm(f.fields?.summary ?? ""));
    return t ? [{ key: f.key, t, jira: { title: f.fields?.summary as string, description: adfToText(f.fields?.description).trim() } }] : [];
  });
}

/** Columna "vs esperado" contra la revisión humana: ✓ si Jev acertó tipo y equipo; los ambiguos aciertan si se escalan. */
function vsExpected(key: string, title: string, c: { tipo: string; equipo: string; action: string }) {
  const h = criterionFor(key, title);
  if (!h) return dim("sin criterio");
  if (h.ambiguous) return c.action === "escalate" ? green("✓ escalado") : yellow("~ no escaló");
  if (!h.expected) return "";
  const misses = [h.expected.tipo !== c.tipo && `tipo:${h.expected.tipo}`, h.expected.equipo !== c.equipo && `eq:${h.expected.equipo}`].filter(Boolean);
  return misses.length ? yellow("~ " + misses.join(" ")) : green("✓");
}

/** Cuántos aciertan tipo y equipo, entre los que tienen criterio y no son ambiguos. */
function hitRate(results: { key: string; t: { title: string }; c: { tipo: string; equipo: string } }[]) {
  const graded = results.filter((r) => { const h = criterionFor(r.key, r.t.title); return h?.expected && !h.ambiguous; });
  const hits = graded.filter((r) => { const e = criterionFor(r.key, r.t.title)!.expected!; return e.tipo === r.c.tipo && e.equipo === r.c.equipo; }).length;
  return `${hits}/${graded.length} ${gray(`(contra ${REVIEW})`)}`;
}

if (MODE === "direct") { await runDirect(); process.exit(0); }

console.log(bold(`\nTriage de ${tickets.length} tickets`), dim(`(${DATA})\n`));

// 1) Obtener o crear issues
const t0 = performance.now();
let keyed: { key: string; t: Ticket }[];
if (NO_CREATE) {
  keyed = await pendingIssues();
  console.log(dim(`${keyed.length} issues encontrados con etiqueta batch`));
} else {
  keyed = await Promise.all(tickets.map(async (t) => ({ key: (await createIssue(t.title, t.description, ["batch"])).key, t })));
  console.log(dim(`${keyed.length} issues creados en ${Math.round(performance.now() - t0)} ms`));
}

// 2) Clasificar todos en paralelo (Jev aguanta sin problema)
const t1 = performance.now();
const results = await Promise.all(
  keyed.map(async ({ key, t }) => {
    const c = await classifyTicket(t.title, t.description, t.reporter);
    await applyClassification(key, c);
    await addComment(key, buildComment(c));
    return { key, t, c };
  })
);
const jevMs = Math.round(performance.now() - t1);

// 3) Tabla
const pct = (n: number) => `${Math.round(n * 100)}`;
const rows = results.map(({ key, t, c }) => [cyan(key), t.title.slice(0, 44), c.tipo, c.prioridad, c.equipo, `${pct(c.confidence.min)} %`, `${pct(c.needsHuman)} %`, colorAction(c.action), `${c.ms}`, vsExpected(key, t.title, c)]);
console.log(table(["Key", "Ticket", "Tipo", "Prioridad", "Equipo", "Conf. mín", "Humano", "Acción", "ms", "vs esperado"], rows, { align: ["l", "l", "l", "l", "l", "r", "r", "l", "r", "l"] }));

// 4) Totales
const count = (a: Classification["action"]) => results.filter((r) => r.c.action === a).length;
const tokens = results.reduce((s, r) => s + r.c.inputTokens, 0);
const cost = jevCost(tokens);

console.log(`
${bold("Totales")}
  Tickets          ${bold(num(results.length))}
  Tiempo total     ${bold(num(jevMs))} ms   ${gray(`(~${Math.round(jevMs / results.length)} ms por ticket, en paralelo)`)}
  Tokens a Jev     ${num(tokens)}
  Costo estimado   ${bold(usd(cost))} USD   ${gray(`(${process.env.JEV_PRICE_PER_M ?? 0.042} USD / M tokens; solo input)`)}
  Acciones         ${green(count("apply") + " apply")} · ${yellow(count("apply_and_flag") + " apply_and_flag")} · ${red(count("escalate") + " escalate")}
  Tipo+equipo OK   ${hitRate(results)}
`);

mkdirSync("results", { recursive: true });
writeFileSync("results/triage.json", JSON.stringify({ at: new Date().toISOString(), jevMs, tokens, cost, results: results.map((r) => ({ key: r.key, id: r.t.id, title: r.t.title, ...r.c })) }, null, 2));
console.log(dim("→ results/triage.json"));

/**
 * El "antes" de la demo 1: lo que costaría este triage si cada ticket lo clasificara Sonnet con un prompt.
 * No toca Jira: es una ejecución de referencia que se hace una vez antes de la sesión y queda en
 * results/triage-direct.json para que `npm run costs` la ponga junto a la de Jev.
 */
async function runDirect() {
  // Los mismos 22 issues reales que clasifica `batch --no-create`, con el título y la descripción tal como están en Jira.
  // Solo lectura: el antes no escribe nada en Jira.
  const pending = await pendingIssues();
  console.log(bold(`\nTriage de ${pending.length} issues · modo ${magenta("direct")}`), dim(`· ${projectKey}, solo lectura · todo a Sonnet, sin Jev\n`));
  if (!pending.length) { console.error(red(`No hay issues con etiqueta batch sin terminar en ${projectKey}. Corre npm run seed -- --done=8.`)); process.exit(1); }

  const t0 = performance.now();
  // Concurrencia acotada: con CLAUDE_ENGINE=cli cada ticket abre un proceso `claude -p`.
  const results = await mapLimit(pending, Number(arg("concurrency") ?? 4), async ({ key, t, jira }) => ({ key, t, c: await classifyTicketDirect(jira.title, jira.description, t.reporter) }));
  const totalMs = Math.round(performance.now() - t0);

  const rows = results.map(({ key, t, c }) => [cyan(key), t.title.slice(0, 44), c.tipo, c.prioridad, c.equipo, c.needsHuman ? "sí" : "no", colorAction(c.action), `${c.input_tokens}/${c.output_tokens}`, `${c.ms}`, c.error ? red("✗ " + c.error.slice(0, 30)) : vsExpected(key, t.title, c)]);
  // Sin columna de confianza: el LLM no da probabilidades. Es lo primero que se nota al ponerla junto a la de Jev.
  console.log(table(["Key", "Ticket", "Tipo", "Prioridad", "Equipo", "Humano", "Acción", "Tokens in/out", "ms", "vs esperado"], rows, { align: ["l", "l", "l", "l", "l", "l", "l", "r", "r", "l"] }));

  const inTok = results.reduce((s, r) => s + r.c.input_tokens, 0), outTok = results.reduce((s, r) => s + r.c.output_tokens, 0);
  const cost = results.reduce((s, r) => s + llmCost(r.c.model, r.c.input_tokens, r.c.output_tokens), 0);
  const count = (a: string) => results.filter((r) => r.c.action === a).length;
  console.log(`
${bold("Totales")}  direct
  Tickets          ${bold(num(results.length))}
  Tiempo total     ${bold(num(totalMs))} ms
  Tokens LLM       ${num(inTok)} in / ${num(outTok)} out
  Costo estimado   ${bold(usd(cost))} USD
  Acciones         ${green(count("apply") + " apply")} · ${red(count("escalate") + " escalate")} ${gray("(sin probabilidades no hay apply_and_flag)")}
  Tipo+equipo OK   ${hitRate(results)}
`);

  mkdirSync("results", { recursive: true });
  writeFileSync("results/triage-direct.json", JSON.stringify({ at: new Date().toISOString(), mode: "direct", totalMs, tokens: { input: inTok, output: outTok }, cost, results: results.map((r) => ({ key: r.key, id: r.t.id, title: r.t.title, ...r.c })) }, null, 2));
  console.log(dim("→ results/triage-direct.json"));
}
