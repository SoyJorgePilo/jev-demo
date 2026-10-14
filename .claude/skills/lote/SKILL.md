---
name: lote
description: Demo 1. Clasifica con Jev los tickets de KAN con etiqueta batch que no están en Finalizada (`npm run batch -- --no-create`) y resume tiempo, acciones, escalados y costo. Usar cuando digan "/lote", "clasifica el backlog", "clasifica los pendientes" o "corre el batch".
disable-model-invocation: true
allowed-tools: Bash(npm run batch:*)
---

# Lote: Jev clasifica el backlog de KAN

Patrón: Jev clasifica en paralelo los tickets que ya existen en Jira; tu código (los umbrales de `shared/thresholds.ts`) decide si se aplica, se marca o se escala. Claude no clasifica: solo ejecuta y resume.

## Pasos

1. Corre `npm run batch -- --no-create` desde la raíz del repo. No crees issues ni uses otros flags.
2. Si el script falla, muestra el error y detente. No clasifiques tú.
3. Muestra la tabla que imprime el script tal cual.
4. Debajo, una sola línea: cuántos tickets, tiempo total, acciones (apply · apply_and_flag · escalate), las keys escaladas, costo de Jev y el "Tipo+equipo OK". Todo sale de la salida del script: no inventes cifras.

Nunca muestres `.env`.
