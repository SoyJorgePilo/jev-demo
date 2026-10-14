/**
 * Costes por ejecución: lee results/*.json y resume tokens, USD y tiempo de cada una.
 *   npm run costs
 *   npm run costs -- --json      → salida JSON (para el skill /costos y para pegar en Slack)
 *   npm run costs -- --demo=1,2  → solo esas demos
 * Una tabla por demo: "solo LLM" (el antes, todo al LLM) frente a "con Jev", y la comparativa debajo.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { table, bold, dim, gray, green, magenta, usd, num, bar } from "../shared/ui.ts";
import { price, llmCost as cost } from "../shared/prices.ts";

const JEV = process.env.JEV_MODEL ?? "jev-1.13.0";
const SMALL = process.env.MODEL_SMALL ?? "claude-haiku-4-5";
const LARGE = process.env.MODEL_LARGE ?? "claude-sonnet-5-5";

type Mode = "llm" | "jev" | "live";
type Row = { demo: string; mode: Mode; run: string; at: string; units: number; jevCalls: number; jevTokens: number; jevUsd: number; llmCalls: number; llmIn: number; llmOut: number; llmUsd: number; totalUsd: number; ms: number };
const rows: Row[] = [];

if (!existsSync("results")) { console.error("No hay results/. Corre alguna ejecución primero."); process.exit(1); }
// El "antes" de la demo 2 se precalcula con otro id (T03 o una key vieja): si es el mismo ticket, se etiqueta como el pre-vuelo de hoy.
const scanNow = existsSync("results/code-health.json") ? JSON.parse(readFileSync("results/code-health.json", "utf8")) : null;
const scanLabel = (d: any) => (scanNow?.ticket && scanNow.ticketTitle === d.ticketTitle ? scanNow.ticket : d.ticket ?? "");
for (const f of readdirSync("results").filter((x) => x.endsWith(".json")).sort()) {
  const d = JSON.parse(readFileSync(`results/${f}`, "utf8"));
  if (f === "triage.json") {
    const jt = d.tokens ?? d.results.reduce((s: number, r: any) => s + (r.inputTokens ?? 0), 0);
    rows.push({ demo: "1", mode: "jev", run: "Demo 1 · triage de Jira · con Jev", at: d.at, units: d.results.length, jevCalls: d.results.length, jevTokens: jt, jevUsd: (jt / 1e6) * price(JEV).input_per_m, llmCalls: 0, llmIn: 0, llmOut: 0, llmUsd: 0, totalUsd: (jt / 1e6) * price(JEV).input_per_m, ms: d.jevMs });
  } else if (f === "triage-direct.json") {
    // El "antes" de la demo 1: Sonnet clasifica cada ticket, sin Jev (batch --mode=direct).
    const llmIn = d.tokens.input, llmOut = d.tokens.output, llmUsd = d.results.reduce((s: number, r: any) => s + cost(r.model, r.input_tokens, r.output_tokens), 0);
    rows.push({ demo: "1", mode: "llm", run: "Demo 1 · triage de Jira · solo LLM", at: d.at, units: d.results.length, jevCalls: 0, jevTokens: 0, jevUsd: 0, llmCalls: d.results.length, llmIn, llmOut, llmUsd, totalUsd: llmUsd, ms: d.totalMs });
  } else if (f === "triage-vivo.json") {
    const jt = d.results.reduce((s: number, r: any) => s + (r.inputTokens ?? 0), 0);
    rows.push({ demo: "1", mode: "live", run: "Demo 1 · triage en vivo (MCP) · con Jev", at: d.at, units: d.results.length, jevCalls: d.results.length, jevTokens: jt, jevUsd: (jt / 1e6) * price(JEV).input_per_m, llmCalls: 0, llmIn: 0, llmOut: 0, llmUsd: 0, totalUsd: (jt / 1e6) * price(JEV).input_per_m, ms: d.jevMs });
  } else if (f === "code-health.json") {
    const ex = d.findings.filter((x: any) => x.explanation);
    const llmIn = ex.reduce((s: number, x: any) => s + x.explanation.input_tokens, 0), llmOut = ex.reduce((s: number, x: any) => s + x.explanation.output_tokens, 0);
    const llmUsd = cost(LARGE, llmIn, llmOut);
    rows.push({ demo: "2", mode: "jev", run: `Demo 2 · pre-vuelo ${d.ticket ?? ""} · con Jev`, at: d.at, units: d.findings.length, jevCalls: d.findings.length, jevTokens: d.jevTokens, jevUsd: d.jevCost, llmCalls: ex.length, llmIn, llmOut, llmUsd, totalUsd: d.jevCost + llmUsd, ms: d.jevMs });
  } else if (f === "code-health-direct.json") {
    // El "antes" de la demo 2: Claude revisa todas las funciones, sin Jev (scan --mode=direct).
    const llmUsd = d.findings.reduce((s: number, x: any) => s + cost(x.review.model, x.review.input_tokens, x.review.output_tokens), 0);
    rows.push({ demo: "2", mode: "llm", run: `Demo 2 · pre-vuelo ${scanLabel(d)} · solo LLM`, at: d.at, units: d.findings.length, jevCalls: 0, jevTokens: 0, jevUsd: 0, llmCalls: d.findings.length, llmIn: d.tokens.input, llmOut: d.tokens.output, llmUsd, totalUsd: llmUsd, ms: d.totalMs });
  } else if (f === "direct.json" || f === "jev.json") {
    let llmIn = 0, llmOut = 0, llmUsd = 0, llmCalls = 0, jevTokens = 0;
    for (const r of d.results) {
      const m = r.route === "haiku" ? SMALL : r.route === "sonnet" ? LARGE : "rules";
      if (m !== "rules") { llmCalls++; llmIn += r.review.input_tokens; llmOut += r.review.output_tokens; llmUsd += cost(m, r.review.input_tokens, r.review.output_tokens); }
      jevTokens += r.decision?.jevTokens ?? 0;
    }
    const jevUsd = (jevTokens / 1e6) * price(JEV).input_per_m;
    rows.push({ demo: "3", mode: d.mode === "direct" ? "llm" : "jev", run: `Demo 3 · revisión de PRs · ${d.mode === "direct" ? "solo LLM" : "con Jev"}`, at: d.at, units: d.results.length, jevCalls: d.mode === "jev" ? d.results.length : 0, jevTokens, jevUsd, llmCalls, llmIn, llmOut, llmUsd, totalUsd: jevUsd + llmUsd, ms: d.totalMs });
  }
}

// Orden de las demos: demos 1, 2 y 3; dentro de cada demo, primero "solo LLM" (el antes).
const ORDER = ["1", "2", "3"], MODES: Mode[] = ["llm", "jev", "live"];
rows.sort((a, b) => ORDER.indexOf(a.demo) - ORDER.indexOf(b.demo) || MODES.indexOf(a.mode) - MODES.indexOf(b.mode));
// --demo=1,2: solo esas demos (en el minuto 17 aún no se presenta la 3, aunque direct.json ya esté calculado)
const only = process.argv.find((a) => a.startsWith("--demo="))?.split("=")[1]?.split(",");
if (only) rows.splice(0, rows.length, ...rows.filter((r) => only.includes(r.demo)));

/** Solo LLM frente a con Jev de una misma demo: cuántas veces más barato y más rápido, y cuántos tokens dejan de ir al LLM. */
function comparison(demo: string) {
  const llm = rows.find((r) => r.demo === demo && r.mode === "llm"), jev = rows.find((r) => r.demo === demo && r.mode === "jev");
  if (!llm || !jev) return null;
  const times = (a: number, b: number) => (b <= 0 ? Infinity : a / b < 10 ? +(a / b).toFixed(1) : Math.round(a / b));
  return {
    llmOnlyUsd: llm.totalUsd, withJevUsd: jev.totalUsd, timesCheaper: times(llm.totalUsd, jev.totalUsd), timesFaster: +(llm.ms / jev.ms).toFixed(1),
    llmTokens: { llmOnly: llm.llmIn + llm.llmOut, withJev: jev.llmIn + jev.llmOut }, savingsPct: Math.round((1 - jev.totalUsd / llm.totalUsd) * 100),
  };
}
const demos = ORDER.filter((d) => rows.some((r) => r.demo === d));
const TITLES: Record<string, string> = { "1": "Demo 1 · Triage de Jira", "2": "Demo 2 · Pre-vuelo", "3": "Demo 3 · Router de PRs" };

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ prices: { [JEV]: price(JEV), [SMALL]: price(SMALL), [LARGE]: price(LARGE) }, rows, comparisons: Object.fromEntries(demos.map((d) => [d, comparison(d)]).filter(([, c]) => c)) }, null, 2));
  process.exit(0);
}

console.log(bold("\nCostes por ejecución"), dim("(USD; precios de shared/prices.json · solo LLM = todo al LLM, sin Jev)"));
for (const demo of demos) {
  const rs = rows.filter((r) => r.demo === demo);
  console.log(`\n${bold(TITLES[demo])}`);
  console.log(table(
    ["Ejecución", "Unidades", "Jev llamadas", "Jev tokens", "Jev USD", "LLM llamadas", "LLM in/out", "LLM USD", "Total USD", "Tiempo"],
    rs.map((r) => [(r.mode === "llm" ? magenta : green)(r.run.split(" · ").slice(1).join(" · ")), r.units, r.jevCalls, num(r.jevTokens), usd(r.jevUsd), r.llmCalls, `${num(r.llmIn)}/${num(r.llmOut)}`, usd(r.llmUsd), bold(usd(r.totalUsd)), `${(r.ms / 1000).toFixed(1)} s`]),
    { align: ["l", "r", "r", "r", "r", "r", "r", "r", "r", "r"] }
  ));
  const c = comparison(demo);
  if (!c) continue;
  const max = Math.max(c.llmOnlyUsd, c.withJevUsd);
  console.log(`  ${magenta("Solo LLM")} ${magenta(bar(c.llmOnlyUsd / max, 30))} ${usd(c.llmOnlyUsd)}`);
  console.log(`  ${green("Con Jev ")} ${green(bar(Math.max(c.withJevUsd / max, 1 / 30), 30))} ${usd(c.withJevUsd)}`);
  console.log(`  ${bold(`${c.timesCheaper}× más barato`)} (${c.savingsPct} % menos) · ${bold(`${c.timesFaster}× más rápido`)} · tokens al LLM ${num(c.llmTokens.llmOnly)} → ${num(c.llmTokens.withJev)}`);
}
const total = rows.reduce((s, r) => s + r.totalUsd, 0);
console.log(`\n${bold(only ? `Total (demo ${only.join(" y ")})` : "Total de la demo")}  ${usd(total)}   ${gray(`Jev ${usd(rows.reduce((s, r) => s + r.jevUsd, 0))} · LLM ${usd(rows.reduce((s, r) => s + r.llmUsd, 0))}`)}\n`);
