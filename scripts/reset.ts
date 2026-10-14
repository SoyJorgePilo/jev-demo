/**
 * Empieza de cero: BORRA los issues de la demo y vacía results/. Las keys cambian; para repetir la demo sin
 * perderlas usa `npm run limpiar`.
 *   npm run reset                → borra issues con etiqueta jev o batch (los de la demo), no todo el proyecto
 *   npm run reset -- --all       → borra TODOS los issues del proyecto DEMO
 *   npm run reset -- --baselines → además borra las ejecuciones "direct" (el antes de cada demo)
 */
import { searchIssues, deleteIssue, projectKey } from "../demo1-triage/jira.ts";
import { clearResults } from "../shared/results.ts";
import { bold, dim, green, red } from "../shared/ui.ts";

const kept = clearResults(!process.argv.includes("--baselines"));
console.log(green("✓"), "results/ vaciado", kept.length ? dim(`(se conservan: ${kept.join(", ")})`) : "");

const all = process.argv.includes("--all");
const jql = all ? `project = ${projectKey}` : `project = ${projectKey} AND (labels = jev OR labels = batch OR labels = revisar OR labels = escalado)`;
const issues = await searchIssues(jql, 200);
console.log(bold(`${issues.length} issues a borrar`), dim(`(${jql})`));
let ok = 0;
await Promise.all(issues.map(async (i) => { try { await deleteIssue(i.key); ok++; } catch (e: any) { console.error(red("✗"), i.key, e.message); } }));
console.log(green("✓"), `${ok} issues borrados de ${projectKey}`);
