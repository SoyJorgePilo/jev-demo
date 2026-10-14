/** Salida de consola legible desde lejos: colores ANSI y tablas con bordes. Sin dependencias. */
const c = (code: number) => (s: string | number) => `\x1b[${code}m${s}\x1b[0m`;
export const bold = c(1), dim = c(2), red = c(31), green = c(32), yellow = c(33), blue = c(34), magenta = c(35), cyan = c(36), gray = c(90);

export function table(headers: string[], rows: (string | number)[][], opts: { align?: ("l" | "r")[] } = {}) {
  const strip = (s: string) => s.replace(/\x1b\[\d+m/g, "");
  const all = [headers, ...rows.map((r) => r.map(String))];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => strip(r[i] ?? "").length)));
  const pad = (s: string, i: number) => {
    const n = widths[i] - strip(s).length;
    return (opts.align?.[i] ?? "l") === "r" ? " ".repeat(n) + s : s + " ".repeat(n);
  };
  const line = (l: string, m: string, r: string) => l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;
  const row = (r: string[]) => "│ " + r.map((s, i) => pad(s ?? "", i)).join(" │ ") + " │";
  return [line("┌", "┬", "┐"), row(headers.map(bold)), line("├", "┼", "┤"), ...rows.map((r) => row(r.map(String))), line("└", "┴", "┘")].join("\n");
}

// Bajo una décima de centavo, más decimales: "$0.0000" en pantalla parece gratis o un error.
export const usd = (n: number) => (n > 0 && n < 0.0001 ? `$${n.toFixed(6)}` : `$${n.toFixed(4)}`);
export const num = (n: number) => n.toLocaleString("es-MX");
export const bar = (ratio: number, width = 20) => "█".repeat(Math.round(ratio * width)).padEnd(width, "░");

export function colorAction(a: string) {
  return a === "apply" ? green(a) : a === "apply_and_flag" ? yellow(a) : red(a);
}
export function colorRoute(r: string) {
  return r === "rules" ? green(r) : r === "haiku" ? cyan(r) : magenta(r);
}
