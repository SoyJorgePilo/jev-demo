---
name: comparar
description: Demo 3. Compara la revisión de PRs "solo LLM" (todo a Sonnet) con la del router de Jev: tokens, costo, ahorro y proyección a 500 PRs al mes. Usar cuando digan "/comparar", "compara direct y jev" o "cuánto se ahorró el router".
allowed-tools: Bash(npm run compare:*)
---

# Comparar: solo LLM frente al router de Jev

Lee resultados ya guardados (`results/direct.json` y `results/jev.json`); no llama a ningún modelo ni escribe en ningún sitio.

## Pasos

1. Corre `npm run compare` desde la raíz del repo.
   - Muestra la tabla tal cual. En el texto, llama **solo LLM** a la fila `llm` y **con Jev** a la fila `jev`; nunca escribas "direct".
   - Debajo, en 2 líneas: el ahorro total (la celda verde de "Ahorro") y las rutas (reglas · Haiku · Sonnet); y la proyección a 500 PRs al mes.
2. Si falta `results/jev.json`, dilo y sugiere `/router`. Si falta `results/direct.json`, sugiere `npm run review -- --mode=direct --data=data/prs-fork.json` (el "antes"; o copia el de ejemplo: `cp results-backup/direct.json results/`).

No inventes cifras: todo sale de la salida de los scripts.
