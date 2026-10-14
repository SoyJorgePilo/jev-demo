#!/usr/bin/env node
/**
 * open-prs.mjs — recrea PRs reales (ya mergeadas en el upstream) como PRs ABIERTAS en tu fork,
 * cada una con su commit original, para que en la demo vivan en GitHub y no en un JSON.
 *
 *   node scripts/open-prs.mjs --fork=TU-USUARIO/medusa --data=data/prs-real.json
 *   node scripts/open-prs.mjs --fork=TU-USUARIO/medusa --dry-run       (todo en local, sin push ni PRs)
 *   opciones: --path=../medusa-fork (clon local; si no existe lo clona) · --branch=develop · --label=jev-demo
 *
 * Requiere: git, gh autenticado con permiso de escritura en el fork, y data/prs-real.json generado
 * con import-prs.mjs --source=git (trae sha y parentSha).
 *
 * Cómo funciona:
 *   1. Crea la rama demo-base en el padre del commit más antiguo.
 *   2. Por cada PR: rama demo/pr-N desde demo-base + cherry-pick del commit original.
 *      Si el cherry-pick choca, usa como base el propio padre del commit (rama base/pr-N) y la cabeza es el commit tal cual.
 *   3. Push de las ramas y `gh pr create` hacia demo-base (o base/pr-N). Etiqueta jev-demo.
 *   Después: node demo3-router/import-prs.mjs --repo=TU-USUARIO/medusa --state=open --count=20 --out=data/prs-fork.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const FORK = args.fork;
if (!FORK) { console.error("Falta --fork=USUARIO/REPO"); process.exit(1); }
const DATA = resolve(args.data ?? "data/prs-real.json");
const BRANCH = args.branch ?? "develop";
const LABEL = args.label ?? "jev-demo";
const DRY = Boolean(args["dry-run"]);
const PATH = resolve(args.path ?? `../${FORK.split("/")[1]}-fork`);

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const git = (...a) => sh("git", ["-C", PATH, ...a]);
const tryGit = (...a) => { try { return { ok: true, out: git(...a) }; } catch (e) { return { ok: false, out: String(e.stderr ?? e.message) }; } };

if (args.cleanup) {
  const list = JSON.parse(sh("gh", ["pr", "list", "--repo", FORK, "--label", LABEL, "--state", "open", "--json", "number,headRefName,baseRefName", "--limit", "100"]));
  for (const pr of list) {
    try { sh("gh", ["pr", "close", String(pr.number), "--repo", FORK, "--delete-branch"]); console.error(`  ✓ cerrada #${pr.number}`); } catch (e) { console.error(`  ✗ #${pr.number}`); }
  }
  const bases = [...new Set(list.map((p) => p.baseRefName).filter((b) => b.startsWith("base/") || b === "demo-base"))];
  for (const b of bases) { try { sh("gh", ["api", "-X", "DELETE", `repos/${FORK}/git/refs/heads/${b}`]); console.error(`  ✓ rama ${b} borrada`); } catch {} }
  console.error(`✓ limpieza lista (${list.length} PRs)`); process.exit(0);
}

const data = JSON.parse(readFileSync(DATA, "utf8"));
const prs = (Array.isArray(data) ? data : data.prs).filter((p) => p.sha && p.parentSha);
if (!prs.length) { console.error("El JSON no trae sha/parentSha. Genera con: import-prs.mjs --source=git ..."); process.exit(1); }
const upstream = data.repo ?? "upstream";

// 1) Clon del fork (con historia suficiente)
if (!existsSync(PATH)) {
  console.error(`→ clonando ${FORK} (${BRANCH}, depth 400) en ${PATH}`);
  execFileSync("git", ["clone", "--depth", "400", "--single-branch", "--branch", BRANCH, `https://github.com/${FORK}.git`, PATH], { stdio: "inherit" });
} else {
  console.error(`→ usando clon existente en ${PATH}`);
  tryGit("fetch", "--depth", "400", "origin", BRANCH);
}
tryGit("config", "user.email", "jev-demo@example.com"); tryGit("config", "user.name", "jev-demo");

// Verifica que los commits existen en el clon (el fork comparte historia con el upstream)
for (const p of prs) if (!tryGit("cat-file", "-e", `${p.sha}^{commit}`).ok) { console.error(`✗ el commit ${p.sha.slice(0, 8)} (#${p.number}) no está en el clon; aumenta --depth o sincroniza el fork con upstream`); process.exit(1); }

// 2) demo-base en el padre del más antiguo
const oldest = prs[prs.length - 1];
git("checkout", "-q", "-B", "demo-base", oldest.parentSha);
console.error(`→ demo-base = ${oldest.parentSha.slice(0, 8)} (padre de #${oldest.number})`);
const toPush = ["demo-base"];
const plan = [];

// 3) ramas por PR
for (const p of prs) {
  const head = `demo/pr-${p.number}`;
  git("checkout", "-q", "-B", head, "demo-base");
  const cp = tryGit("cherry-pick", "-x", "--allow-empty", p.sha);
  if (cp.ok) {
    plan.push({ ...p, head, base: "demo-base", how: "cherry-pick" });
    toPush.push(head);
    console.error(`  ✓ #${p.number} cherry-pick → ${head}`);
  } else {
    tryGit("cherry-pick", "--abort");
    const base = `base/pr-${p.number}`;
    git("branch", "-f", base, p.parentSha);
    git("checkout", "-q", "-B", head, p.sha);
    plan.push({ ...p, head, base, how: "propio padre" });
    toPush.push(base, head);
    console.error(`  ~ #${p.number} conflicto → base propia ${base}, cabeza = commit original`);
  }
}
git("checkout", "-q", BRANCH);

if (DRY) { console.error(`\n[dry-run] ${plan.length} PRs preparadas en local, nada enviado. Ramas: ${toPush.length}`); process.exit(0); }

// 4) push + PRs
console.error(`→ push de ${toPush.length} ramas a ${FORK}`);
execFileSync("git", ["-C", PATH, "push", "-f", "origin", ...toPush], { stdio: "inherit" });

try { sh("gh", ["label", "create", LABEL, "--repo", FORK, "--color", "5319E7", "--description", "PR recreada para la demo de Jev", "--force"]); } catch {}

const created = [];
for (const p of plan) {
  const body = [
    `Recreada para la demo de Jev a partir de **${upstream}#${p.number}** (${p.url}).`,
    ``, `Commit original: \`${p.sha}\` · base: \`${p.base}\` (${p.how}).`,
    ``, `_No mergear: es material de demostración._`,
  ].join("\n");
  try {
    const url = sh("gh", ["pr", "create", "--repo", FORK, "--base", p.base, "--head", p.head, "--title", p.title, "--body", body, "--label", LABEL]);
    created.push({ number: p.number, url });
    console.error(`  ✓ PR abierta: ${url}  (${p.title.slice(0, 50)})`);
  } catch (e) {
    console.error(`  ✗ #${p.number}: ${String(e.stderr ?? e.message).split("\n")[0]}`);
  }
}

console.error(`\n✓ ${created.length}/${plan.length} PRs abiertas en https://github.com/${FORK}/pulls?q=is:open+label:${LABEL}`);
console.error(`Siguiente: node demo3-router/import-prs.mjs --repo=${FORK} --state=open --count=${plan.length} --out=data/prs-fork.json`);
console.error(`Limpieza al final: node scripts/open-prs.mjs --fork=${FORK} --cleanup   (cierra las PRs y borra las ramas)`);
