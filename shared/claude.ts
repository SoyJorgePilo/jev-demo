/**
 * Transporte de Claude para la revisión de PRs y las explicaciones del pre-vuelo.
 * - "api": Messages API directa (ANTHROPIC_API_KEY).
 * - "cli": claude -p (Claude Code headless) con tu sesión de Claude Code, sin gastar saldo de la API.
 * Por defecto "api" si hay ANTHROPIC_API_KEY, si no "cli". Se fuerza con CLAUDE_ENGINE.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type ClaudeEngine = "api" | "cli";
export const ENGINE: ClaudeEngine =
  process.env.CLAUDE_ENGINE === "cli" || process.env.CLAUDE_ENGINE === "api" ? process.env.CLAUDE_ENGINE : process.env.ANTHROPIC_API_KEY ? "api" : "cli";

export type ClaudeOut = { model: string; text: string; input_tokens: number; output_tokens: number };

export function callClaude(model: string, prompt: string, maxTokens: number): Promise<ClaudeOut> {
  return ENGINE === "cli" ? callCli(model, prompt) : callApi(model, prompt, maxTokens);
}

async function callApi(model: string, prompt: string, maxTokens: number): Promise<ClaudeOut> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en .env (o usa CLAUDE_ENGINE=cli)");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return {
    model: data.model ?? model,
    text: (data.content ?? []).map((b: any) => b.text ?? "").join(""),
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };
}

let sandbox: string | undefined;

/** Sin herramientas, sin MCP y desde una carpeta temporal: así no carga CLAUDE.md ni el arnés de agente. */
function callCli(model: string, prompt: string): Promise<ClaudeOut> {
  sandbox ??= mkdtempSync(path.join(tmpdir(), "jev-dev-demo-"));
  const args = ["-p", "--model", model, "--output-format", "json", "--system-prompt", "Eres un revisor de código senior.", "--tools", "", "--strict-mcp-config", "--no-session-persistence"];
  return new Promise((resolve, reject) => {
    // Sin ANTHROPIC_API_KEY: si no, claude -p la usa en lugar de la sesión de Claude Code.
    const { ANTHROPIC_API_KEY: _, ...env } = process.env;
    const child = spawn("claude", args, { cwd: sandbox, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 5 * 60_000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => reject(new Error(`No se pudo ejecutar 'claude': ${e.message}. ¿Está instalado Claude Code?`)));
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const out = JSON.parse(stdout);
        if (code !== 0 || out.is_error) return reject(new Error(`claude -p falló (${code}): ${out.result ?? stderr.slice(-400)}`));
        const u = out.usage ?? {};
        resolve({
          model,
          text: out.result ?? "",
          // Todo lo que entró, incluida la caché: es lo que se consume de verdad.
          input_tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
          output_tokens: u.output_tokens ?? 0,
        });
      } catch {
        reject(new Error(`claude -p devolvió algo que no es JSON (código ${code}): ${(stderr || stdout).slice(-400)}`));
      }
    });
    child.stdin.end(prompt);
  });
}
