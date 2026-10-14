---
name: triage
description: Demo 1 en vivo. Crea un issue en Jira con el MCP de Atlassian a partir de lo que diga el usuario y lo clasifica con Jev (tipo, prioridad, equipo, si necesita humano). Usar cuando digan "/triage", "crea un ticket y clasifícalo", "levanta un issue de..." o peguen una queja de cliente.
---

# Triage en vivo: Claude crea, Jev decide

Patrón: Claude Code redacta y crea el issue con el MCP; Jev lo clasifica en milisegundos; tu código (los umbrales de `shared/thresholds.ts`) decide si se aplica, se marca o se escala.

## Pasos

1. Del texto del usuario saca uno o varios issues (uno por problema). Para cada uno: resumen corto en español y la descripción con lo que dijo el cliente, sin inventar datos.
2. Créalos con el MCP de Atlassian (`createJiraIssue`) en el proyecto de `JIRA_PROJECT_KEY` (KAN), tipo `Tarea` y sin prioridad ni etiquetas: la clasificación la pone Jev, no tú. No uses la etiqueta `batch`.
3. Corre `npm run triage -- <KEY> [<KEY>...]` con las keys creadas. No clasifiques tú: si el script falla, muestra el error y detente.
4. Muestra la tabla que imprime el script tal cual y, debajo, una línea por issue: qué decidió Jev y la acción (aplicado, aplicado y marcado para revisión, o escalado a humano).
5. Cierra con el tiempo y el costo de Jev que imprime el script. Nada más.

Si no hay MCP de Atlassian conectado, pide al usuario que lo autentique con `/mcp` → `atlassian`. Nunca muestres `.env`.
