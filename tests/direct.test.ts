import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDirectTicket } from "../demo1-triage/llm.ts";
import { parseFlags } from "../demo2-pre-vuelo/explain.ts";

test("parseDirectTicket: lee el JSON aunque venga dentro de un bloque ```json", () =>
  assert.deepEqual(parseDirectTicket('```json\n{"tipo":"bug","prioridad":"critica","equipo":"pagos","needs_human":false}\n```'), { tipo: "bug", prioridad: "critica", equipo: "pagos", needsHuman: false }));
test("parseDirectTicket: una opción que no existe es error, no se adivina", () =>
  assert.throws(() => parseDirectTicket('{"tipo":"incidente","prioridad":"alta","equipo":"pagos","needs_human":false}'), /tipo inválido/));
test("parseFlags: solo cuenta claves conocidas", () => assert.deepEqual(parseFlags("MARCAS: oculta_errores, inventada, numero_magico\n..."), ["oculta_errores", "numero_magico"]));
test("parseFlags: 'ninguna' o sin línea MARCAS → sin marcas", () => { assert.deepEqual(parseFlags("MARCAS: ninguna"), []); assert.deepEqual(parseFlags("La función está bien."), []); });
