/**
 * Siembra los 30 tickets en Jira SIN clasificarlos (etiqueta "batch" para que el servidor los ignore).
 * Es la alternativa por API a importar el CSV. Deja el backlog desordenado que quieres mostrar.
 *   npm run seed
 *   npm run seed -- --data=data/tickets.json
 *   npm run seed -- --done=8        → además mueve los últimos 8 a "Listo" (tablero con historia, no un lote recién importado)
 */
import { readFileSync } from "node:fs";
import { createIssue, transitionTo, addComment, projectKey } from "../demo1-triage/jira.ts";
import { bold, dim, green, yellow } from "../shared/ui.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const tickets: { id: string; title: string; description: string }[] = JSON.parse(readFileSync(arg("data") ?? "data/tickets.json", "utf8"));

const DONE = Number(arg("done") ?? 0);
console.log(bold(`Sembrando ${tickets.length} tickets en ${projectKey}`), DONE ? dim(`(${DONE} irán a Listo)`) : "");
// En orden y en serie: así las keys quedan en el mismo orden que tickets.json y batch --no-create los empareja bien.
const keys: string[] = [];
for (const t of tickets) {
  const r = await createIssue(t.title, t.description, ["batch"]);
  keys.push(r.key);
  console.log(green("✓"), r.key, dim(t.title.slice(0, 60)));
}
// Los N "hechos": tomamos tickets claros (no ambiguos) del final de la lista, los movemos a Listo y les quitamos la etiqueta batch
// para que batch --no-create no los toque. Dan la sensación de un proyecto vivo con historial.
if (DONE > 0) {
  const candidates = tickets.map((t, i) => ({ t, key: keys[i] })).filter((x) => !(x.t as any).ambiguous).slice(-DONE);
  for (const { t, key } of candidates) {
    try {
      const r = await transitionTo(key);
      await addComment(key, "Resuelto en el sprint anterior. (Ticket histórico para la demo)");
      console.log(green("✓"), key, dim(`→ ${r.to}`), dim(t.title.slice(0, 50)));
    } catch (e: any) { console.log(yellow("~"), key, e.message); }
  }
}
console.log(bold("Listo."), "Ahora el tablero está desordenado a propósito. En la demo: npm run batch -- --no-create");
