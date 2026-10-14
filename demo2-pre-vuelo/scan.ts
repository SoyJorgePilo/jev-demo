/**
 * Demo 2 — Pre-vuelo: bugs que YA existen en el código que vas a tocar para una tarea.
 *
 *   npm run scan -- --ticket=KAN-XXX        → lee el issue en Jira y lo mapea por título a data/tickets-files.json
 *                                              (la key cambia con cada seed; los archivos ensayados no)
 *   npm run scan -- --ticket=T03            → lo mismo con el id de data/tickets.json, sin Jira (respaldo sin red)
 *   npm run scan -- --files=a.ts,b.ts
 *   npm run scan -- --ticket=<key de Jira> --files=… --title="…"  → archivos elegidos a mano para un issue sin mapear
 *   npm run scan -- --ticket=KAN-XXX --explain  → las funciones marcadas van a Claude para explicación y propuesta de refactor
 *   npm run scan -- --ticket=KAN-XXX --mode=direct  → el "antes": Claude revisa las 58 funciones, sin Jev (se precalcula)
 *
 * Patrón: por cada función, Jev responde 6 preguntas tipadas en una sola llamada (milisegundos, centavos).
 * Solo lo que Jev marca con probabilidad alta va al LLM. Jev encuentra dónde buscar; Claude encuentra qué.
 *
 *   Jev: questions.ts (qué se pregunta) · analyze.ts (la llamada por función) · flagsFrom() en shared/thresholds.ts
 *   Claude: explain.ts (explica lo marcado; y el "antes", revisar todas)
 *   Este archivo: el comando. Lee el ticket, parte los archivos en funciones (split.ts) y pinta la tabla.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { jevCost } from "../shared/jev.ts";
import { analyzeFunctions } from "./analyze.ts";
import { splitFunctions, type Fn } from "./split.ts";
import { explainFinding, reviewFunctionDirect } from "./explain.ts";
import { llmCost, mapLimit } from "../shared/prices.ts";
import { table, bold, dim, green, yellow, red, cyan, gray, magenta, usd, num } from "../shared/ui.ts";
import { getIssue } from "../demo1-triage/jira.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const TICKET = arg("ticket");
const EXPLAIN = process.argv.includes("--explain");
const MODE = (arg("mode") ?? "jev") as "jev" | "direct";

let files: string[];
let ticketTitle = "";
if (arg("files")) {
  // Con --ticket=<key de Jira> --files=… --title="…" el ticket viene de Jira (lo lee Claude con el MCP en /pre-vuelo)
  files = arg("files")!.split(",").map((s) => s.trim());
} else if (TICKET) {
  const map = JSON.parse(readFileSync("data/tickets-files.json", "utf8"));
  const tickets = JSON.parse(readFileSync("data/tickets.json", "utf8"));
  let t = tickets.find((x: any) => x.id === TICKET);
  if (!t && /^[A-Z][A-Z0-9]+-\d+$/.test(TICKET)) {
    // Key de Jira: el número cambia con cada seed, así que se mapea por título (sin mayúsculas, acentos ni espacios)
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const issue = await getIssue(TICKET).catch((e) => { console.error(red(`No pude leer ${TICKET} en Jira: ${e.message}`)); console.error("Sin red, usa el id del ticket: --ticket=T03"); process.exit(1); });
    t = tickets.find((x: any) => norm(x.title) === norm(issue.title));
    if (!t) { console.error(red(`${TICKET} "${issue.title}" no coincide con ningún ticket de data/tickets.json`)); console.error(`Elige los archivos a mano: --ticket=${TICKET} --files=… --title="${issue.title}"`); process.exit(1); }
    ticketTitle = issue.title;
  }
  files = map[t?.id];
  if (!files) { console.error(red(`No hay archivos mapeados para ${TICKET} en data/tickets-files.json`)); process.exit(1); }
  ticketTitle ||= t.title;
} else { console.error("Uso: --ticket=KAN-XXX | --ticket=T03 | --files=a.ts,b.ts [--ticket=<key> --title=\"…\"]"); process.exit(1); }
const title = process.argv.find((a) => a.startsWith("--title="))?.slice("--title=".length);
if (title) ticketTitle = title;

// "medusa:ruta" → clon local de LIDR-academy/medusa
const MEDUSA = (process.env.MEDUSA_PATH ?? "../medusa-fork").replace(/\/$/, "");
files = files.map((f) => (f.startsWith("medusa:") ? `${MEDUSA}/${f.slice("medusa:".length)}` : f));
const missing = files.filter((f) => !existsSync(f));
if (missing.length) {
  console.error(red(`No encuentro: ${missing.join(", ")}`));
  if (missing.some((f) => f.startsWith(MEDUSA))) console.error(`Clona Medusa: gh repo clone LIDR-academy/medusa ${MEDUSA} -- --depth 1  (o define MEDUSA_PATH en .env)`);
  process.exit(1);
}
/** Ruta corta para la tabla: sin el prefijo de Medusa. */
const short = (f: string) => f.replace(`${MEDUSA}/packages/`, "");

console.log(bold(`\nPre-vuelo${TICKET ? ` para ${TICKET}` : ""}`), ticketTitle ? dim(`"${ticketTitle}"`) : "", dim(`· ${files.length} archivos\n`));

// 1) Partir en funciones
const all: { file: string; fn: Fn }[] = [];
for (const f of files) for (const fn of splitFunctions(readFileSync(f, "utf8"))) all.push({ file: f, fn });
console.log(dim(`${all.length} funciones en ${files.length} archivos`));

if (MODE === "direct") { await runDirect(); process.exit(0); }

// 2) Jev por función, en paralelo (analyze.ts)
const { findings, jevMs, reused } = await analyzeFunctions(all, { fresh: process.argv.includes("--fresh") });
if (reused) console.log(dim(`(${reused} respuestas de Jev reutilizadas del escaneo anterior; --fresh para volver a preguntar)`));

// 3) Tabla
findings.sort((x, y) => y.severity - x.severity || y.flags.length - x.flags.length);
const sevColor = (s: number) => (s >= 2.5 ? red : s >= 1.5 ? yellow : s >= 0.8 ? gray : green);
const rows = findings.map((f) => [
  cyan(short(f.file)),
  bold(f.fn.name),
  String(f.fn.lines),
  f.flags.length ? f.flags.map((x) => `${x.key} ${Math.round(x.p * 100)}%`).join(", ") : green("limpia"),
  sevColor(f.severity)(f.severity.toFixed(1)),
  `${f.jevMs}`,
]);
console.log(table(["Archivo", "Función", "Líneas", "Lo que marcó Jev", "Sev.", "ms"], rows, { align: ["l", "l", "r", "l", "r", "r"] }));

const flagged = findings.filter((f) => f.flags.length);
const tokens = findings.reduce((s, f) => s + f.jevTokens, 0);
console.log(`
${bold("Jev")}  ${findings.length} funciones · ${num(jevMs)} ms total · ${num(tokens)} tokens · ${usd(jevCost(tokens))}
      ${red(flagged.length + " marcadas")} · ${green(findings.length - flagged.length + " limpias")} → solo las marcadas van al LLM
`);

// 4) Claude explica solo lo marcado
if (EXPLAIN && flagged.length) {
  console.log(bold(`Claude explica ${flagged.length} funciones marcadas`), dim("(las limpias no gastan tokens)\n"));
  let llmIn = 0, llmOut = 0;
  // En paralelo: la espera es la de la explicación más lenta, no la suma.
  const explanations = await Promise.all(flagged.map((f) => explainFinding(f.file, f.fn, f.flags, ticketTitle)));
  for (const [i, f] of flagged.entries()) {
    const e = explanations[i];
    f.explanation = e; llmIn += e.input_tokens; llmOut += e.output_tokens;
    console.log(`${magenta("■")} ${bold(f.fn.name)} ${dim(`(${short(f.file)})`)} ${gray(`${e.model} · ${e.input_tokens} in / ${e.output_tokens} out`)}`);
    console.log("  " + e.text.split("\n").join("\n  ") + "\n");
  }
  console.log(dim(`LLM: ${num(llmIn)} in / ${num(llmOut)} out tokens en ${flagged.length} llamadas; ${findings.length - flagged.length} funciones no costaron nada.`));
}

mkdirSync("results", { recursive: true });
writeFileSync("results/code-health.json", JSON.stringify({ at: new Date().toISOString(), ticket: TICKET, ticketTitle, files, jevMs, jevTokens: tokens, jevCost: jevCost(tokens), findings: findings.map((f) => ({ file: f.file, function: f.fn.name, lines: f.fn.lines, flags: f.flags, severity: f.severity, answers: f.answers, jevMs: f.jevMs, jevTokens: f.jevTokens, explanation: f.explanation })) }, null, 2));
console.log(dim("→ results/code-health.json"));

/**
 * El "antes" de la demo 2: sin Jev no sabes qué funciones mirar, así que Claude revisa todas. Cada función es una
 * llamada a Sonnet con el código completo. Se corre una vez antes de la sesión y queda en
 * results/code-health-direct.json; `npm run costs` la pone junto a la ejecución con Jev.
 */
async function runDirect() {
  console.log(bold(`Modo ${magenta("direct")}: Claude revisa las ${all.length} funciones`), dim("· sin Jev\n"));
  const t0 = performance.now();
  // Concurrencia acotada: con CLAUDE_ENGINE=cli cada función abre un proceso `claude -p`.
  const reviews = await mapLimit(all, Number(arg("concurrency") ?? 6), async ({ file, fn }) => ({ file, fn, r: await reviewFunctionDirect(file, fn, ticketTitle) }));
  const totalMs = Math.round(performance.now() - t0);

  const flagged = reviews.filter((x) => x.r.flags.length);
  console.log(table(["Archivo", "Función", "Líneas", "Lo que marcó Claude", "Tokens in/out", "ms"],
    flagged.map((x) => [cyan(short(x.file)), bold(x.fn.name), String(x.fn.lines), x.r.flags.join(", "), `${x.r.input_tokens}/${x.r.output_tokens}`, `${x.r.ms}`]),
    { align: ["l", "l", "r", "l", "r", "r"] }));

  const inTok = reviews.reduce((s, x) => s + x.r.input_tokens, 0), outTok = reviews.reduce((s, x) => s + x.r.output_tokens, 0);
  const cost = reviews.reduce((s, x) => s + llmCost(x.r.model, x.r.input_tokens, x.r.output_tokens), 0);
  console.log(`
${bold("Claude")}  ${reviews.length} funciones · ${reviews.length} llamadas · ${(totalMs / 1000).toFixed(1)} s · ${num(inTok)} in / ${num(outTok)} out · ${bold(usd(cost))}
        ${red(flagged.length + " marcadas")} · ${green(reviews.length - flagged.length + " limpias")} → las limpias también costaron: hubo que leerlas para saberlo
`);

  mkdirSync("results", { recursive: true });
  writeFileSync("results/code-health-direct.json", JSON.stringify({ at: new Date().toISOString(), mode: "direct", ticket: TICKET, ticketTitle, files, totalMs, tokens: { input: inTok, output: outTok }, cost,
    findings: reviews.map((x) => ({ file: x.file, function: x.fn.name, lines: x.fn.lines, flags: x.r.flags, review: { model: x.r.model, text: x.r.text, input_tokens: x.r.input_tokens, output_tokens: x.r.output_tokens, ms: x.r.ms } })) }, null, 2));
  console.log(dim("→ results/code-health-direct.json"));
}
