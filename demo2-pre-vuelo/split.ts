/**
 * Parte un archivo TypeScript en funciones de primer nivel y calcula señales baratas (sin AST, sin dependencias).
 * Suficiente para la demo y para la mayoría de módulos de servicio; para clases con métodos, extiende aquí.
 */
export type Fn = { name: string; params: string[]; source: string; lines: number; startLine: number };

const HEAD = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)|^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]*)?=>/;
// Método de clase (indentado): [modificadores] nombre(params) [: tipo] {   — también con params en varias líneas
const METHOD = /^\s+(?:(?:public|private|protected|static|async|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;
const NOT_METHOD = new Set(["if", "for", "while", "switch", "catch", "return", "await", "function", "constructor", "super", "new", "typeof", "else"]);

export function splitFunctions(src: string, opts: { methods?: boolean } = { methods: true }): Fn[] {
  const lines = src.split("\n");
  const out: Fn[] = [];
  for (let i = 0; i < lines.length; i++) {
    let m = lines[i].match(HEAD);
    let name: string, paramsRaw: string;
    if (m) {
      name = m[1] ?? m[3];
      paramsRaw = m[2] ?? m[4] ?? "";
    } else if (opts.methods) {
      const mm = lines[i].match(METHOD);
      if (!mm || NOT_METHOD.has(mm[1])) continue;
      // Debe abrir cuerpo con "{" en esta línea o en las siguientes 6 (firma multilínea); si aparece ";" antes, es una declaración de interfaz
      let k = i, head = "";
      for (; k < Math.min(lines.length, i + 7); k++) { head += lines[k] + "\n"; if (/\{\s*$/.test(lines[k]) || /\)\s*(?::[^{;]*)?\{/.test(lines[k])) break; if (/;\s*$/.test(lines[k])) { k = -1; break; } }
      if (k === -1 || k >= Math.min(lines.length, i + 7)) continue;
      if (/^\s*(if|for|while|switch|catch)\b/.test(lines[i])) continue;
      name = mm[1];
      paramsRaw = (head.match(/\(([\s\S]*?)\)\s*(?::|\{)/) ?? [, ""])[1] ?? "";
    } else continue;
    const params = paramsRaw.replace(/\n/g, " ").split(",").map((p) => p.trim().split(/[:=]/)[0].replace(/^(\.\.\.|@\w+\(\)\s*)/, "").trim()).filter((p) => p && /^[A-Za-z_$]/.test(p));
    // cuerpo: desde la primera { hasta que las llaves cierren
    let depth = 0, started = false, j = i;
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") { depth++; started = true; }
        else if (ch === "}") depth--;
      }
      if (started && depth === 0) break;
    }
    const source = lines.slice(i, j + 1).join("\n");
    out.push({ name, params, source, lines: j - i + 1, startLine: i + 1 });
    i = j;
  }
  return out;
}

/** Señales baratas que acompañan al código en el estado: ayudan a Jev y sirven de contraste. */
export function cheapSignals(fn: Fn) {
  const s = fn.source;
  const emptyish = /catch\s*(\([^)]*\))?\s*\{\s*(\/\/[^\n]*\s*)*(return[^;]*;)?\s*\}/.test(s);
  const returnsOkInCatch = /catch[\s\S]*?\{[\s\S]*?ok:\s*true/.test(s);
  const literals = (s.match(/(?<![\w.])\d*\.\d+(?![\w])/g) ?? []).filter((n) => !["0.5"].includes(n));
  const mutations = fn.params.filter((p) => new RegExp(`\\b${p}\\.(\\w+)\\s*(=[^=]|\\+=|-=)|\\b${p}\\.push\\(`).test(s));
  const sideEffects = ["fetch(", "send", "Email", "log", "metrics", "audit", "db.", "set(", "await update"].filter((k) => s.includes(k)).length;
  const awaits = (s.match(/\bawait\b/g) ?? []).length;
  const maxDepth = Math.max(0, ...s.split("\n").map((l) => (l.match(/^\s*/)?.[0].length ?? 0) / 2));
  return {
    lines: fn.lines,
    awaits,
    side_effect_kinds: sideEffects,
    catch_swallow_hint: emptyish || returnsOkInCatch,
    decimal_literals: literals.slice(0, 8),
    mutated_params: mutations,
    max_nesting: Math.round(maxDepth),
    comment_sections: (s.match(/\/\/\s*\d+\./g) ?? []).length, // "// 1. ...", "// 2. ..." = pistas de varias etapas
  };
}

/** Funciones parecidas por tokens compartidos (Jaccard sobre identificadores y operadores). */
export function similarTo(fn: Fn, all: Fn[], min = 0.35): Fn[] {
  const toks = (s: string) => new Set((s.match(/[A-Za-z_$][\w$]*|\d+\.\d+|[+\-*/]/g) ?? []).filter((t) => t.length > 1 || "+-*/".includes(t)));
  const a = toks(fn.source);
  return all
    .filter((o) => o !== fn && o.name !== fn.name)
    .map((o) => { const b = toks(o.source); const inter = [...a].filter((t) => b.has(t)).length; return { o, j: inter / (a.size + b.size - inter) }; })
    .filter((x) => x.j >= min)
    .sort((x, y) => y.j - x.j)
    .slice(0, 3)
    .map((x) => x.o);
}
