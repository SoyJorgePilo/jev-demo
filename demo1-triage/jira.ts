/**
 * Cliente mínimo de Jira Cloud (REST v3) sobre fetch.
 */
import type { Classification } from "./classify.ts";

const BASE = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
const PROJECT = process.env.JIRA_PROJECT_KEY ?? "DEMO";
// Campo "Team" de Jira (Atlassian Teams): se le pasa el id del equipo, no su nombre.
const TEAM_FIELD = process.env.JIRA_TEAM_FIELD_ID || "customfield_10001";
const TEAM_IDS: Record<string, string | undefined> = {
  pagos: process.env.JIRA_TEAM_PAGOS, plataforma: process.env.JIRA_TEAM_PLATAFORMA, frontend: process.env.JIRA_TEAM_FRONTEND, datos: process.env.JIRA_TEAM_DATOS,
};

// Mapeo de las opciones de Jev a los nombres que Jira espera. Ajusta a tu proyecto.
// Proyecto KAN (team-managed en español): Error, Historia, Tarea.
export const ISSUE_TYPE: Record<string, string> = { bug: "Error", feature: "Historia", deuda_tecnica: "Tarea", soporte: "Tarea" };
export const PRIORITY: Record<string, string> = { critica: "Highest", alta: "High", media: "Medium", baja: "Low" };

function auth() {
  const email = process.env.JIRA_EMAIL, token = process.env.JIRA_API_TOKEN;
  if (!BASE || !email || !token) throw new Error("Faltan JIRA_BASE_URL, JIRA_EMAIL o JIRA_API_TOKEN en .env");
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

async function jira(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}/rest/api/3${path}`, {
    ...init,
    headers: { Authorization: auth(), Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Jira ${res.status} ${path}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Atlassian Document Format mínimo para un comentario de texto plano con saltos de línea. */
const adf = (text: string) => ({
  type: "doc", version: 1,
  content: [{ type: "paragraph", content: text.split("\n").flatMap((l, i) => (i ? [{ type: "hardBreak" }, { type: "text", text: l }] : [{ type: "text", text: l }])) }],
});

/** Jira manda la descripción en ADF; la aplanamos a texto. */
export function adfToText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(adfToText).join("");
  return node.type === "paragraph" ? inner + "\n" : inner;
}

/** Lee un issue existente (lo crea Claude Code con el MCP de Atlassian; aquí solo lo clasificamos). */
export async function getIssue(key: string) {
  const d = await jira(`/issue/${key}?fields=summary,description,reporter,labels`);
  return {
    key: d.key as string,
    title: (d.fields?.summary ?? "") as string,
    description: adfToText(d.fields?.description).trim(),
    reporter: (d.fields?.reporter?.displayName ?? "desconocido") as string,
    labels: (d.fields?.labels ?? []) as string[],
  };
}

export async function createIssue(summary: string, description: string, labels: string[] = []) {
  return jira("/issue", {
    method: "POST",
    body: JSON.stringify({ fields: { project: { key: PROJECT }, summary, description: adf(description || "(sin descripción)"), issuetype: { name: ISSUE_TYPE.soporte }, labels } }),
  });
}

export async function applyClassification(key: string, c: Classification) {
  const fields: Record<string, unknown> = {};
  if (c.action !== "escalate") {
    fields.issuetype = { name: ISSUE_TYPE[c.tipo] ?? ISSUE_TYPE.soporte };
    fields.priority = { name: PRIORITY[c.prioridad] ?? "Medium" };
    if (TEAM_IDS[c.equipo]) fields[TEAM_FIELD] = TEAM_IDS[c.equipo];
  }
  // "escalado" ≠ "revisar": así el filtro labels = escalado muestra solo los que necesitan a una persona.
  const labels = c.action === "escalate" ? ["escalado"] : c.labels;
  const update = { labels: labels.map((l) => ({ add: l })) };

  // Cambiar issuetype puede requerir el endpoint de "move" en algunos proyectos; en team-managed funciona por PUT.
  await jira(`/issue/${key}`, { method: "PUT", body: JSON.stringify({ fields, update }) });
  return { key, fields, labels };
}

/** Deshace applyClassification: tipo y prioridad como los deja `seed`, sin Team ni responsable, y solo la etiqueta batch. */
export async function undoClassification(key: string) {
  const fields = { issuetype: { name: ISSUE_TYPE.soporte }, priority: { name: "Medium" }, [TEAM_FIELD]: null, assignee: null, labels: ["batch"] };
  await jira(`/issue/${key}`, { method: "PUT", body: JSON.stringify({ fields }) });
}

export async function getComments(key: string): Promise<{ id: string; text: string }[]> {
  const data = await jira(`/issue/${key}/comment?maxResults=100`);
  return (data.comments ?? []).map((c: any) => ({ id: c.id, text: adfToText(c.body) }));
}

export async function deleteComment(key: string, id: string) {
  await jira(`/issue/${key}/comment/${id}`, { method: "DELETE" });
}

export async function addComment(key: string, text: string) {
  return jira(`/issue/${key}/comment`, { method: "POST", body: JSON.stringify({ body: adf(text) }) });
}

export async function searchIssues(jql: string, maxResults = 100, fields = ["key"]): Promise<{ key: string; fields?: Record<string, any> }[]> {
  const data = await jira(`/search/jql`, { method: "POST", body: JSON.stringify({ jql, maxResults, fields }) });
  return data.issues ?? [];
}

/** Mueve un issue a un estado por nombre (p. ej. "Done"/"Listo"). Busca la transición disponible que coincida. */
export async function transitionTo(key: string, statusPattern: RegExp = /^(done|listo|finalizad|terminad|cerrad|complet)/i) {
  const data = await jira(`/issue/${key}/transitions`);
  const t = (data.transitions ?? []).find((x: any) => statusPattern.test(x.to?.name ?? "") || statusPattern.test(x.name ?? ""));
  if (!t) throw new Error(`No hay transición a Done/Listo para ${key}. Disponibles: ${(data.transitions ?? []).map((x: any) => x.to?.name).join(", ")}`);
  await jira(`/issue/${key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: t.id } }) });
  return { key, to: t.to?.name ?? t.name };
}

export async function deleteIssue(key: string) {
  await jira(`/issue/${key}?deleteSubtasks=true`, { method: "DELETE" });
}

export const projectKey = PROJECT;
