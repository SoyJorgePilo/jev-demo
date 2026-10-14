#!/usr/bin/env node
/**
 * import-prs.mjs — genera data/prs-fork.json a partir de PRs REALES de un repo.
 *
 * Dos fuentes, misma salida:
 *   --source=github  (default) usa la API de GitHub vía `gh` CLI: PRs mergeadas con número, URL, archivos, diff.
 *   --source=git     usa el historial local de un repo con squash-merge: cada commit en main es una PR (#1234).
 *
 * Uso:
 *   node demo3-router/import-prs.mjs --repo=medusajs/medusa --count=20
 *   node demo3-router/import-prs.mjs --source=git --path=../medusajs/medusa --count=20
 *   node demo3-router/import-prs.mjs --repo=TU-ORG/TU-REPO --count=20 --exclude-docs
 *   node demo3-router/import-prs.mjs --repo=TU-USUARIO/medusa --state=open --count=20   (las PRs abiertas de tu fork)
 *
 * Requiere: Node 20+, git; con --source=github también `gh auth login`.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const SOURCE = args.source ?? "github";
const COUNT = Number(args.count ?? 20);
const EXCLUDE_DOCS = Boolean(args["exclude-docs"]);
const isDocsOnly = (files) =>
  files.length > 0 && files.every((f) => /\.(md|mdx)$/i.test(f) || f.startsWith("www/") || f.startsWith("docs/"));
const MAX_DOCS = args["max-docs"] !== undefined ? Number(args["max-docs"]) : Infinity; // tope de PRs solo-docs
let docsTaken = 0;
const skipDocs = (files) => {
  if (!isDocsOnly(files)) return false;
  if (EXCLUDE_DOCS || docsTaken >= MAX_DOCS) return true;
  docsTaken++;
  return false;
};
const OUT = resolve(args.out ?? "data/prs-fork.json");
const MAX_DIFF_LINES = Number(args["diff-lines"] ?? 60);
const MAX_FILES = 25;

const sh = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });

/** Recorta el diff a lo que Jev y el LLM necesitan: cabeceras de archivo + primeras líneas de cada hunk. */
function summarizeDiff(patch, maxLines) {
  const lines = patch.split("\n");
  const out = [];
  let budgetPerFile = Math.max(8, Math.floor(maxLines / 4));
  let inFile = 0;
  for (const l of lines) {
    if (l.startsWith("diff --git")) {
      out.push(l.replace(/^diff --git a\/(.+?) b\/.+$/, "### $1"));
      inFile = 0;
      continue;
    }
    if (l.startsWith("index ") || l.startsWith("--- ") || l.startsWith("+++ ")) continue;
    if (inFile < budgetPerFile && (l.startsWith("+") || l.startsWith("-") || l.startsWith("@@"))) {
      out.push(l.length > 160 ? l.slice(0, 157) + "…" : l);
      inFile++;
    }
    if (out.length >= maxLines) {
      out.push("… (diff recortado)");
      break;
    }
  }
  return out.join("\n");
}


function fromGitHub() {
  const repo = args.repo;
  if (!repo) throw new Error("Falta --repo=owner/name");
  console.error(`→ GitHub API: últimas PRs mergeadas de ${repo}`);
  const STATE = args.state ?? "merged"; // merged | open
  const list = JSON.parse(
    sh("gh", ["api", `repos/${repo}/pulls`, "-X", "GET", "-f", `state=${STATE === "open" ? "open" : "closed"}`, "-f", "per_page=60", "-f", "sort=created", "-f", "direction=desc"])
  ).filter((p) => (STATE === "open" ? true : p.merged_at));

  const prs = [];
  for (const p of list) {
    if (prs.length >= COUNT) break;
    const detail = JSON.parse(sh("gh", ["api", `repos/${repo}/pulls/${p.number}`]));
    const files = JSON.parse(sh("gh", ["api", `repos/${repo}/pulls/${p.number}/files`, "-X", "GET", "-f", "per_page=100"]));
    const fileNames = files.map((f) => f.filename);
    if (skipDocs(fileNames)) continue;
    const patch = files.map((f) => `diff --git a/${f.filename} b/${f.filename}\n${f.patch ?? ""}`).join("\n");
    prs.push({
      id: `PR-${p.number}`,
      number: p.number,
      url: p.html_url,
      title: p.title,
      author: p.user?.login,
      mergedAt: p.merged_at,
      state: p.state,
      headSha: p.head?.sha,
      files: fileNames.slice(0, MAX_FILES),
      changedFiles: detail.changed_files,
      additions: detail.additions,
      deletions: detail.deletions,
      body: (p.body ?? "").slice(0, 800),
      diffSummary: summarizeDiff(patch, MAX_DIFF_LINES),
    });
    console.error(`  #${p.number} ${p.title}`);
  }
  return { repo, prs };
}

function fromGit() {
  const path = resolve(args.path ?? ".");
  const remote = sh("git", ["-C", path, "remote", "get-url", "origin"]).trim();
  const repo = remote.replace(/^.*github\.com[/:]/, "").replace(/\.git$/, "");
  console.error(`→ git log local en ${path} (${repo}), commits con (#número) = PRs squash-mergeadas`);
  const log = sh("git", ["-C", path, "log", "--format=%H%x09%s%x09%an%x09%cI", "-n", "300"]).trim().split("\n");

  const prs = [];
  const seen = new Set();
  for (const row of log) {
    if (prs.length >= COUNT) break;
    const [sha, subject, author, date] = row.split("\t");

    // Estilo A: squash-merge → "título (#1234)". Estilo B: merge commit → "Merge pull request #1234 from org/rama".
    let number, title, diffSpec;
    const squash = subject.match(/\(#(\d+)\)\s*$/);
    const merge = subject.match(/^Merge pull request #(\d+) from \S+/);
    if (squash) {
      number = Number(squash[1]);
      title = subject.replace(/\s*\(#\d+\)\s*$/, "");
      diffSpec = [`${sha}^`, sha];             // padre → commit
    } else if (merge) {
      number = Number(merge[1]);
      // Título = asunto del primer commit de la rama (segundo padre); si no hay, el del merge
      try { title = sh("git", ["-C", path, "log", "-1", "--format=%s", `${sha}^2`]).trim(); } catch { title = subject; }
      diffSpec = [`${sha}^1`, sha];            // diff entre main antes del merge y después
    } else continue;
    if (seen.has(number)) continue;
    seen.add(number);

    const numstat = sh("git", ["-C", path, "diff", "--numstat", ...diffSpec]).trim().split("\n").filter(Boolean);
    const files = numstat.map((l) => l.split("\t")[2]).filter(Boolean);
    if (skipDocs(files)) continue;
    let additions = 0, deletions = 0;
    for (const l of numstat) {
      const [a, d] = l.split("\t");
      if (a !== "-") additions += Number(a);
      if (d !== "-") deletions += Number(d);
    }
    const patch = sh("git", ["-C", path, "diff", "--no-color", ...diffSpec]);
    const body = sh("git", ["-C", path, "show", "-s", "--format=%b", squash ? sha : `${sha}^2`]).trim().slice(0, 800);

    prs.push({
      id: `PR-${number}`,
      number,
      sha,
      parentSha: sh("git", ["-C", path, "rev-parse", `${sha}^`]).trim(),
      mergeStyle: squash ? "squash" : "merge",
      url: `https://github.com/${repo}/pull/${number}`,
      title,
      author,
      mergedAt: date,
      files: files.slice(0, MAX_FILES),
      changedFiles: files.length,
      additions,
      deletions,
      body,
      diffSummary: summarizeDiff(patch, MAX_DIFF_LINES),
    });
    console.error(`  #${number} ${title}`);
  }
  return { repo, prs };
}

const { repo, prs } = SOURCE === "git" ? fromGit() : fromGitHub();
if (prs.length < COUNT) console.error(`⚠ solo se encontraron ${prs.length} PRs (pedías ${COUNT})`);

mkdirSync(resolve(OUT, ".."), { recursive: true });
writeFileSync(OUT, JSON.stringify({ repo, importedAt: new Date().toISOString(), source: SOURCE, prs }, null, 2));
console.error(`✓ ${prs.length} PRs reales de ${repo} → ${OUT}`);

// Resumen rápido de la mezcla, para saber si la demo tendrá triviales/medias/complejas
const buckets = { "≤10 líneas": 0, "11–100": 0, "101–500": 0, ">500": 0 };
for (const p of prs) {
  const n = p.additions + p.deletions;
  buckets[n <= 10 ? "≤10 líneas" : n <= 100 ? "11–100" : n <= 500 ? "101–500" : ">500"]++;
}
console.error("Mezcla por tamaño:", JSON.stringify(buckets));
