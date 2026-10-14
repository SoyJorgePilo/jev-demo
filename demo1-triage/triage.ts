/**
 * Demo 1 en vivo desde Claude Code: Claude crea el issue con el MCP de Atlassian y este script lo clasifica con Jev.
 *   npm run triage -- KAN-130            → lee el issue, Jev lo clasifica, escribe tipo, prioridad, etiquetas y comentario
 *   npm run triage -- KAN-130 KAN-131    → varios
 * Cada ejecución se acumula en results/triage-vivo.json para npm run costs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { classifyTicket, buildComment } from "./classify.ts";
import { getIssue, applyClassification, addComment } from "./jira.ts";
import { jevCost } from "../shared/jev.ts";
import { table, bold, dim, red, cyan, colorAction, usd, num } from "../shared/ui.ts";

const keys = process.argv.slice(2).filter((a) => /^[A-Z][A-Z0-9]+-\d+$/.test(a));
if (!keys.length) { console.error(red("Uso: npm run triage -- KAN-130 [KAN-131 ...]")); process.exit(1); }

const pct = (n: number) => `${Math.round(n * 100)} %`;
const t0 = performance.now();
const results = await Promise.all(keys.map(async (key) => {
  const issue = await getIssue(key);
  const c = await classifyTicket(issue.title, issue.description, issue.reporter);
  await applyClassification(key, c);
  await addComment(key, buildComment(c));
  return { key, title: issue.title, ...c };
}));
const totalMs = Math.round(performance.now() - t0);

console.log(bold(`\nTriage en vivo\n`));
console.log(table(
  ["Key", "Ticket", "Tipo", "Prioridad", "Equipo", "Conf. mín", "Humano", "Acción", "ms"],
  results.map((r) => [cyan(r.key), r.title.slice(0, 44), `${r.tipo} (${pct(r.confidence.tipo)})`, `${r.prioridad} (${pct(r.confidence.prioridad)})`, `${r.equipo} (${pct(r.confidence.equipo)})`, pct(r.confidence.min), pct(r.needsHuman), colorAction(r.action), `${r.ms}`]),
));
const tokens = results.reduce((s, r) => s + r.inputTokens, 0);
console.log(`\n${bold("Jev")}  ${results.length} issue(s) · ${totalMs} ms con Jira incluido · ${num(tokens)} tokens · ${usd(jevCost(tokens))}\n`);

// Acumulado para npm run costs
mkdirSync("results", { recursive: true });
const file = "results/triage-vivo.json";
const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { results: [], jevMs: 0 };
writeFileSync(file, JSON.stringify({
  at: new Date().toISOString(),
  jevMs: prev.jevMs + Math.max(...results.map((r) => r.ms)),
  results: [...prev.results, ...results],
}, null, 2));
console.log(dim(`→ ${file}`));
