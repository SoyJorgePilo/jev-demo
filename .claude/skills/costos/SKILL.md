---
name: costos
description: Saca el coste de cada ejecución de la demo de Jev (triage, pre-vuelo, revisión de PRs) en tokens y USD, una tabla por demo con "solo LLM" frente a "con Jev". Acepta las demos a mostrar ("/costos 1,2"). Usar cuando pidan "costos", "cuánto costó", "tokens por ejecución" o "/costos".
argument-hint: "[demos, p. ej. 1,2]"
---

# Costes por ejecución

1. Corre `npm run costs -- --json` desde la raíz del repo y lee el JSON (no lo muestres completo). Si el usuario indicó demos (`/costos 1,2`, "solo la 1 y la 2"), añade `--demo=1,2` con esos números: así no aparece una demo que aún no se presenta.
2. Una sección por demo (campo `demo` de cada fila: 1, 2 y 3), con un título ("Demo 1 · Triage de Jira", "Demo 2 · Pre-vuelo", "Demo 3 · Router de PRs") y su propia tabla. Columnas: Ejecución, Unidades, Jev tokens, Jev USD, LLM in/out, LLM USD, Total USD (en negrita) y Tiempo. En Ejecución di **Solo LLM** cuando `mode` es `llm` y **Con Jev** cuando es `jev` o `live` (el triage en vivo es "Con Jev · en vivo (MCP)"); nunca escribas "direct". Primero la fila Solo LLM.
3. Debajo de cada tabla, la comparativa de `comparisons[demo]` si existe, en una línea: "Con Jev: **N× más barato** (X % menos) y **M× más rápido** · tokens al LLM A → B".
4. Cierra con el total de las demos mostradas, cuánto fue de Jev y cuánto del LLM. Las filas Solo LLM son los "antes" precalculados.
5. Si no hay `results/`, dilo y sugiere qué comando correr (`npm run batch`, `npm run scan -- --ticket=KAN-XXX --explain`, `npm run review -- --mode=direct|jev`; los antes de las demos 1 y 2 con `--mode=direct` en `batch` y `scan`).
6. Si piden los precios, léelos de `shared/prices.json` y recuerda que conviene revisarlos antes de comparar.

No inventes cifras: todo sale del JSON.
