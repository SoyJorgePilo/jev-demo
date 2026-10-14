---
name: pre-vuelo
description: Antes de tocar código para un ticket, escanea con Jev las funciones de los archivos involucrados y detecta bugs ya existentes (varias responsabilidades, errores ocultos, mutación de parámetros, números mágicos, lógica duplicada); solo lo marcado se explica con Claude. Usar cuando digan "pre-vuelo", "revisa el código antes de la tarea", "qué bugs hay en lo que voy a tocar" o "/pre-vuelo KAN-XXX".
argument-hint: "KAN-XXX [solo-jev]"
---

# Pre-vuelo: bugs que ya existen en el código que vas a tocar

Patrón: Jev decide qué funciones merecen atención (milisegundos, centavos); Claude explica solo esas.

## Pasos

1. Identifica el ticket: una key de Jira (`KAN-…`, la forma normal en la demo), el id de `data/tickets.json` (`T03`, respaldo sin red) o los archivos.
   - **Key de Jira**: las keys cambian cada vez que se recrean los issues (`npm run seed`, reset del tablero), así que nunca asumas qué key corresponde a qué ticket ni la guardes en ningún archivo. `scan.ts` lee el issue con la API de Jira (`JIRA_*` en `.env`) y lo mapea por título a `data/tickets-files.json`; tú solo pásale la key.
   - Si `scan.ts` dice que el issue no coincide con ningún ticket, lee el issue con el MCP de Atlassian (`getJiraIssue`), busca en el repo y en Medusa los archivos relacionados con el resumen y la descripción, y propón la lista antes de escanear. Si el issue no existe, dilo y pide la key correcta.
   - Si Jira no responde, usa el id del ticket (`T03`) y dilo.
   - Las rutas `medusa:…` apuntan a Medusa en `MEDUSA_PATH` (por defecto `../medusa-fork`). Pásalas tal cual a `--files`, sin expandirlas.
2. Desde la raíz de este repo (no dentro de Medusa), corre `npm run scan -- --ticket=<key> --explain`. Con `solo-jev` ("/pre-vuelo KAN-XXX solo-jev"), corre lo mismo **sin** `--explain`: solo Jev, sin Claude; presenta la tabla y cuántas funciones quedaron marcadas y limpias, y salta los pasos 3 y 4. Para un issue sin mapear, con los archivos que propusiste: `npm run scan -- --ticket=<key> --files=<archivos separados por coma> --title="<resumen del issue>" --explain`. Si faltan llaves en `.env`, dilo y detente.
3. Lee `results/code-health.json`. Presenta:
   - Una tabla corta: función, archivo, lo que marcó Jev con su %, severidad.
   - Para cada función marcada, la explicación de Claude resumida en 2 líneas y el refactor mínimo propuesto.
   - Cuántas funciones quedaron limpias y no costaron tokens de LLM.
4. Termina con una recomendación de orden: qué arreglar antes de empezar la tarea, qué puede esperar, y si alguna señal parece falso positivo, dilo.
5. Si piden aplicar un refactor, hazlo en una rama nueva y muestra el diff antes de commitear.

## Umbrales

`SCAN.flag` en `shared/thresholds.ts` (0.6, junto a los umbrales de las demos 1 y 3; se puede mover con `SCAN_THRESHOLD` en `.env`) decide desde qué probabilidad una señal cuenta como marca. Súbelo si hay ruido, bájalo si se escapan bugs. Las preguntas tipadas viven en `demo2-pre-vuelo/questions.ts`; ajusta las descripciones de los `criteria`, no el código del escáner, si Jev clasifica mal.
