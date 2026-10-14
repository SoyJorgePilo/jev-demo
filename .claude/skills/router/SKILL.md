---
name: router
description: Demo 3. Jev decide con qué modelo se revisa cada PR (reglas, Haiku o Sonnet), Claude revisa y el veredicto queda como comentario en GitHub. "/router" revisa las PRs de tu fork y comenta; "/router sin comentar" no publica nada. Usar cuando digan "/router" o "revisa las PRs con el router".
argument-hint: "[sin comentar]"
disable-model-invocation: true
allowed-tools: Bash(npm run review:*)
---

# Router: Jev elige el modelo, Claude revisa

Patrón: una llamada a Jev por PR (complejidad y si toca dinero); tu código (`routeFor` en `shared/thresholds.ts`) elige la ruta: lo trivial va a reglas sin LLM, lo medio a Haiku, y lo complejo, lo dudoso o lo que toca dinero a Sonnet. Claude no elige la ruta: solo ejecuta y resume.

## Pasos

1. Comprueba `data/prs-fork.json`. Si no existe, dile al usuario que lo genere desde su fork (README, demo 3) y detente. Si su campo `repo` no es un fork del usuario (por ejemplo `LIDR-academy/medusa`), no uses `--comment`: solo se comenta en PRs propias.
2. Elige el comando según lo que pida el usuario. Desde la raíz del repo:
   - `/router`: `npm run review -- --mode=jev --data=data/prs-fork.json --comment`
   - `/router sin comentar`: lo mismo sin `--comment` (no escribe en GitHub).
   No uses `--mode=direct` ni otros flags: el "antes" ya está precalculado.
3. Tarda entre 30 y 40 s. Si el script falla, muestra el error y detente. No revises tú las PRs.
4. Muestra el bloque "Resumen" que imprime el script tal cual.
5. Debajo, en 3 líneas como máximo, todo sacado de la salida y de `results/jev.json`:
   - Cuántas PRs fueron a reglas, Haiku y Sonnet.
   - Las PRs que fueron a Sonnet porque tocan dinero o porque Jev dudó (campo `decision.reason`), con su id.
   - Con `--comment`: cuántos comentarios se publicaron, y uno de los enlaces para abrirlo en el navegador.
6. No inventes cifras ni compares con el modo direct: eso lo hace `/comparar`.

Nunca muestres `.env`.
