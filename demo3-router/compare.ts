/**
 * Compara results/direct.json vs results/jev.json: tokens, costo, ahorro. El wow de la demo 3.
 *   npm run compare
 */
import { readFileSync, existsSync } from "node:fs";
import { table, bold, dim, green, red, magenta, gray, usd, bar, colorRoute } from "../shared/ui.ts";
import { price, llmCost as costOf } from "../shared/prices.ts";

type R = { route: string; model: string; decision?: { jevTokens: number; touchesMoney: number; reason: string; complejidad: string }; review: { model: string; input_tokens: number; output_tokens: number }; pr: { id: string; title: string } };
type File = { mode: string; repo: string; totalMs: number; results: R[] };

const MODEL_SMALL = process.env.MODEL_SMALL ?? "claude-haiku-4-5";
const MODEL_LARGE = process.env.MODEL_LARGE ?? "claude-sonnet-5-5";
const JEV_MODEL = process.env.JEV_MODEL ?? "jev-1.13.0";

for (const m of ["direct", "jev"]) if (!existsSync(`results/${m}.json`)) { console.error(red(`Falta results/${m}.json — corre: npm run review -- --mode=${m}`)); process.exit(1); }
const direct: File = JSON.parse(readFileSync("results/direct.json", "utf8"));
const jev: File = JSON.parse(readFileSync("results/jev.json", "utf8"));

function totals(f: File) {
  let inp = 0, out = 0, llm = 0, jevTok = 0;
  for (const r of f.results) {
    inp += r.review.input_tokens; out += r.review.output_tokens;
    const model = r.route === "haiku" ? MODEL_SMALL : r.route === "sonnet" ? MODEL_LARGE : "rules";
    llm += costOf(model, r.review.input_tokens, r.review.output_tokens);
    jevTok += r.decision?.jevTokens ?? 0;
  }
  const jevCost = (jevTok / 1e6) * price(JEV_MODEL).input_per_m;
  return { inp, out, llm, jevTok, jevCost, total: llm + jevCost, n: f.results.length };
}
const D = totals(direct), J = totals(jev);
const pctDown = (a: number, b: number) => (a === 0 ? "—" : `−${Math.round((1 - b / a) * 100)} %`);

console.log(bold(`\nMismo lote de ${D.n} PRs${jev.repo && jev.repo !== "sintético" ? ` de ${jev.repo}` : ""}, dos formas de revisarlas`), "\n");
console.log(
  table(
    ["Modo", "PRs", "Tokens in", "Tokens out", "Costo LLM", "Costo Jev", "Total USD"],
    [
      [magenta("llm"), D.n, D.inp.toLocaleString(), D.out.toLocaleString(), usd(D.llm), "—", bold(usd(D.total))],
      [green("jev"), J.n, J.inp.toLocaleString(), J.out.toLocaleString(), usd(J.llm), usd(J.jevCost), bold(usd(J.total))],
      [bold("Ahorro"), "", bold(pctDown(D.inp, J.inp)), bold(pctDown(D.out, J.out)), "", "", bold(green(pctDown(D.total, J.total)))],
    ],
    { align: ["l", "r", "r", "r", "r", "r", "r"] }
  )
);

const byRoute = jev.results.reduce<Record<string, number>>((m, r) => ((m[r.route] = (m[r.route] ?? 0) + 1), m), {});
const escal = jev.results.filter((r) => r.decision && r.route === "sonnet" && r.decision.complejidad !== "alta");
console.log(`
${bold("Rutas en modo jev")}   ${["rules", "haiku", "sonnet"].map((r) => `${colorRoute(r)} ${byRoute[r] ?? 0}`).join("  ·  ")}
${["rules", "haiku", "sonnet"].map((r) => `  ${colorRoute(r)}${" ".repeat(6 - r.length)} ${bar((byRoute[r] ?? 0) / J.n)} ${byRoute[r] ?? 0}`).join("\n")}
${escal.length ? `\n${bold("Escaladas por regla, no por complejidad")} (${escal.length}):\n` + escal.map((r) => `  ${r.pr.id}  ${dim(r.pr.title.slice(0, 50))}  ${gray(r.decision!.reason)}`).join("\n") : ""}

${bold("Costo de Jev en modo jev")}   ${J.n} llamadas · ${J.jevTok.toLocaleString()} tokens · ${usd(J.jevCost)}
${gray(`Precios: ${MODEL_LARGE} ${price(MODEL_LARGE).input_per_m}/${price(MODEL_LARGE).output_per_m} · ${MODEL_SMALL} ${price(MODEL_SMALL).input_per_m}/${price(MODEL_SMALL).output_per_m} · ${JEV_MODEL} ${price(JEV_MODEL).input_per_m} USD por M tokens (shared/prices.json)`)}

${bold("Proyección a escala")}   si el equipo revisa 500 PRs al mes con esta mezcla:
  llm     ${usd((D.total / D.n) * 500)}   →   jev  ${usd((J.total / J.n) * 500)}   ${green(pctDown(D.total, J.total))}
`);
