/**
 * Devuelve el tablero al minuto 0 sin borrarlo: las keys no cambian, así que puedes repetir la demo con el mismo tablero.
 *   npm run limpiar
 * 1) Los tickets sembrados sin terminar (etiqueta batch): quita lo que puso Jev (tipo, prioridad, Team, etiquetas y sus comentarios).
 * 2) Borra los issues creados en vivo con /triage (etiqueta jev, sin batch).
 * 3) Vacía results/ salvo los tres "antes".
 * Los tickets en Finalizada no se tocan. Para empezar de cero con keys nuevas: npm run reset.
 */
import { searchIssues, undoClassification, getComments, deleteComment, deleteIssue, projectKey } from "../demo1-triage/jira.ts";
import { COMMENT_PREFIX } from "../demo1-triage/classify.ts";
import { clearResults } from "../shared/results.ts";
import { bold, dim, green, red } from "../shared/ui.ts";

const pending = await searchIssues(`project = ${projectKey} AND labels = batch AND statusCategory != Done ORDER BY key ASC`, 200);
console.log(bold(`${pending.length} tickets sembrados a limpiar`));
let comments = 0;
await Promise.all(pending.map(async ({ key }) => {
  try {
    await undoClassification(key);
    const jev = (await getComments(key)).filter((c) => c.text.startsWith(COMMENT_PREFIX));
    for (const c of jev) await deleteComment(key, c.id);
    comments += jev.length;
  } catch (e: any) { console.error(red("✗"), key, e.message); }
}));
console.log(green("✓"), `${pending.length} tickets como los dejó seed · ${comments} comentarios de Jev borrados`);

const live = await searchIssues(`project = ${projectKey} AND labels = jev AND labels != batch`, 200, ["summary"]);
for (const i of live) {
  try { await deleteIssue(i.key); console.log(green("✓"), `${i.key} borrado`, dim(i.fields?.summary ?? "")); }
  catch (e: any) { console.error(red("✗"), i.key, e.message); }
}

const kept = clearResults();
console.log(green("✓"), "results/ vaciado", kept.length ? dim(`(se conservan: ${kept.join(", ")})`) : "");
