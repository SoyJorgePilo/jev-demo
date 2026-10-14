/** Comentarios en PRs de GitHub vía fetch. Usa GITHUB_TOKEN o, si está vacío, la sesión de `gh` (gh auth token). */
import { execFileSync } from "node:child_process";

function ghToken(): string | undefined {
  try { return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined; } catch { return undefined; }
}
const TOKEN = process.env.GITHUB_TOKEN || ghToken();

export function parsePrUrl(url?: string): { owner: string; repo: string; number: number } | null {
  const m = url?.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

export async function commentOnPR(url: string | undefined, body: string): Promise<"ok" | "skipped" | string> {
  const ref = parsePrUrl(url);
  if (!ref) return "skipped";
  if (!TOKEN) return "skipped";
  const res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return res.ok ? "ok" : `GitHub ${res.status}: ${(await res.text()).slice(0, 120)}`;
}

export function routerComment(d: { complejidad: string; confidence: number; touchesMoney: number; route: string; reason: string; jevMs: number }, review?: { model: string; text: string; input_tokens: number; output_tokens: number }) {
  const pct = (n: number) => `${Math.round(n * 100)} %`;
  const lines = [
    `### 🤖 Router con Jev`,
    `| Complejidad | Confianza | ¿Toca dinero? | Ruta | Motivo | Jev |`,
    `| --- | --- | --- | --- | --- | --- |`,
    `| **${d.complejidad}** | ${pct(d.confidence)} | ${pct(d.touchesMoney)} | **${d.route}** | ${d.reason} | ${d.jevMs} ms |`,
  ];
  if (review) {
    lines.push(``, `<details><summary>Revisión (${review.model} · ${review.input_tokens} in / ${review.output_tokens} out tokens)</summary>`, ``, review.text, ``, `</details>`);
  }
  lines.push(``, `_Jev no escribe, Jev elige. Lo que elige lo ejecuta tu código._`);
  return lines.join("\n");
}
