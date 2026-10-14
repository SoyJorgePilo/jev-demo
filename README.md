# jev-demo

**Jev decide, el LLM razona.** Tres demos con servicios reales (Jev, Claude, Jira y GitHub) sobre el mismo patrón:

> estado → pregunta tipada → **Jev** → probabilidad → **tu código decide** → acción

[Jev](https://typesafe.ai) (TypeSafe AI) no escribe texto: responde preguntas cerradas (elige una opción, sí/no, una puntuación) con su probabilidad, en milisegundos y por fracciones de centavo. Tu código decide qué hacer con esa probabilidad, y Claude solo trabaja donde hace falta, con el modelo que hace falta.

| Demo | Qué hace | Carpeta | Skills |
| --- | --- | --- | --- |
| 1 · Triage de Jira | Jev clasifica cada ticket (tipo, prioridad, equipo y si necesita a una persona); tu código aplica, aplica y marca para revisión, o escala. | `demo1-triage/` | `/triage`, `/lote` |
| 2 · Pre-vuelo | Antes de tocar código, Jev revisa cada función y marca las que ya tienen problemas. Claude explica solo las marcadas. | `demo2-pre-vuelo/` | `/pre-vuelo` |
| 3 · Router de PRs | Jev decide qué PR va a reglas sin LLM, cuál a Haiku y cuál a Sonnet. Claude revisa y comenta en GitHub. | `demo3-router/` | `/router`, `/comparar` |
| Costos | Tokens y USD de cada ejecución: "solo LLM" (todo a Sonnet) frente a "con Jev". | `scripts/costs.ts` | `/costos` |

Todo es real: no hay modo simulado. Cada comando llama a los servicios de verdad y los tokens salen del `usage` de cada API.

## Requisitos

- **Node 22.18 o más nuevo** (`node --version`). Ejecuta TypeScript directo: no hay dependencias ni `npm install`.
- **[Claude Code](https://claude.com/claude-code)** con sesión iniciada. Los scripts llaman a Claude con `claude -p`: no necesitas API key de Anthropic.
- **Llave de Jev** (`TYPESAFE_API_KEY`), de la consola de TypeSafe AI. Con unos dólares de saldo te sobra: cada demo cuesta centavos.
- **Jira Cloud** (el plan gratuito sirve) y un token de API.
- **git** y **[GitHub CLI](https://cli.github.com)** (`gh auth login`) para la demo 3.

## Dónde está cada cosa

### La configuración de Jev

| Archivo | Qué es |
| --- | --- |
| `shared/jev.ts` | **El cliente de Jev.** Un `fetch` a `POST https://api.typesafe.ai/v1/systemone` con `model`, `state` (los datos) y `questions`; vuelven `answers` con probabilidades y `usage`. Tiene tres bloques: las formas de preguntar (`choice`, `noul`, `score`), la llamada (`askJev`) y el costo. |
| `demo1-triage/questions.ts` | **Lo que se le pregunta a Jev** en la demo 1: 4 preguntas por ticket (tipo, prioridad, equipo, si necesita a una persona). |
| `demo2-pre-vuelo/questions.ts` | Demo 2: 6 preguntas por función (responsabilidades, oculta errores, muta la entrada, números mágicos, lógica duplicada, severidad). |
| `demo3-router/questions.ts` | Demo 3: 2 preguntas por PR (complejidad y si toca dinero). |
| `shared/thresholds.ts` | **Lo que decide tu código** con esas probabilidades. Un bloque por demo: `THRESHOLDS` + `decide()`, `SCAN` + `flagsFrom()` y `ROUTER` + `routeFor()`. Son números tuyos, no del modelo, y están cubiertos por pruebas. |
| `shared/prices.json` | USD por millón de tokens de Jev, Sonnet y Haiku. Revísalos antes de comparar costos. |
| `.env` | Llaves y modelos (`JEV_MODEL`, `MODEL_SMALL`, `MODEL_LARGE`). Se copia de `.env.example`; nunca lo subas a git. |

Si Jev clasifica mal, ajusta las descripciones de los `criteria` en los `questions.ts`. Si quieres que actúe con más o menos cautela, mueve los umbrales.

### Las demos

| Ruta | Qué es |
| --- | --- |
| `demo1-triage/classify.ts` | Llama a Jev con las preguntas del ticket y decide la acción con `decide()`. |
| `demo1-triage/triage.ts` | Clasifica issues que ya existen (`npm run triage -- KAN-1`). Lo usa `/triage`. |
| `demo1-triage/batch.ts` | Clasifica todo el backlog en paralelo y compara contra `data/humanreview.json`. Lo usa `/lote`. |
| `demo1-triage/jira.ts` | Cliente de Jira Cloud y mapeo de las opciones de Jev a tipos y prioridades de Jira. |
| `demo1-triage/llm.ts` | El "antes" de la demo 1: el mismo triage solo con Claude. |
| `demo2-pre-vuelo/scan.ts` | El comando de la demo 2: lee el ticket, parte los archivos en funciones, pregunta a Jev y manda solo lo marcado a Claude. |
| `demo2-pre-vuelo/analyze.ts` | La llamada a Jev por función, con caché, y `flagsFrom()`. |
| `demo2-pre-vuelo/split.ts` | Parte un archivo en funciones, sin AST. |
| `demo2-pre-vuelo/explain.ts` | Claude explica una función marcada. Con `--mode=direct`, el "antes": Claude revisa todas. |
| `demo3-router/router.ts` | Una llamada a Jev por PR; `routeFor()` elige la ruta. |
| `demo3-router/review.ts` | Revisa las PRs (`--mode=jev` o `--mode=direct`) y, con `--comment`, comenta en GitHub. |
| `demo3-router/llm.ts` | Revisión con Claude o con reglas locales (cero tokens). |
| `demo3-router/compare.ts` | Tabla "solo LLM" frente a "con Jev": tokens, costo, ahorro y proyección. |
| `demo3-router/import-prs.mjs` | Trae PRs reales de cualquier repo a un JSON. |
| `scripts/open-prs.mjs` | Recrea las 20 PRs de `data/prs-real.json` como PRs abiertas en tu fork. |
| `scripts/seed.ts`, `clean.ts`, `reset.ts` | Siembran el backlog en Jira, lo devuelven al punto de partida o lo borran. |
| `scripts/costs.ts` | Costo de cada ejecución, una tabla por demo. |

### Los skills de Claude Code (`.claude/skills/`)

| Skill | Qué hace | Script |
| --- | --- | --- |
| `/triage <queja de cliente>` | Claude redacta y crea el issue con el MCP de Atlassian; Jev lo clasifica. | `npm run triage` |
| `/lote` | Jev clasifica todos los tickets pendientes del backlog. Solo se activa a mano porque escribe en Jira. | `npm run batch -- --no-create` |
| `/pre-vuelo KAN-XXX [solo-jev]` | Jev revisa las funciones que toca el ticket; sin `solo-jev`, Claude explica las marcadas. | `npm run scan` |
| `/router [sin comentar]` | Jev elige el modelo de cada PR, Claude revisa y comenta en tu fork. Solo se activa a mano porque escribe en GitHub. | `npm run review -- --mode=jev` |
| `/comparar` | Solo LLM frente a con Jev en la demo 3. | `npm run compare` |
| `/costos [1,2]` | Costo de cada ejecución, una tabla por demo. | `npm run costs` |

Cada skill solo ejecuta y resume: Claude no clasifica ni elige rutas; eso lo hacen Jev y tu código. El MCP de Atlassian ya está en `.mcp.json`: al abrir Claude Code en este repo, acéptalo y autentícate con `/mcp` → `atlassian`.

### Datos

| Ruta | Qué es |
| --- | --- |
| `data/tickets.json` | 30 tickets de una tienda en línea: 27 claros y 3 ambiguos (T28–T30). Es lo que siembra `seed`. |
| `data/humanreview.json` | Tipo, prioridad y equipo esperados de cada ticket, según una persona. `batch` compara a Jev contra esto (por key o, si tus keys son otras, por título). |
| `data/tickets-files.json` | Qué archivos de Medusa toca cada ticket (demo 2). |
| `data/prs-real.json` | 20 PRs reales de [medusajs/medusa](https://github.com/medusajs/medusa), con el commit de cada una para recrearlas. |
| `data/prs-fork.json` | *(lo generas tú)* Esas 20 PRs, abiertas en tu fork. |
| `results-backup/` | Ejecuciones de ejemplo, incluidos los tres "antes" (todo a Sonnet), para que `/comparar` y `/costos` funcionen sin gastar. Son de nuestro Jira y nuestro fork: para comparar con lo tuyo, genera los tuyos (paso 6). |
| `results/` | *(se crea solo, no se sube)* Lo que escribe cada ejecución. |

## Puesta en marcha

### 1. Llaves

```bash
git clone https://github.com/LIDR-academy/jev-demo && cd jev-demo
cp .env.example .env     # llena las llaves
npm test                 # 16 pruebas: umbrales y lectura de respuestas
```

| Variable | Dónde se consigue |
| --- | --- |
| `TYPESAFE_API_KEY` | Consola de TypeSafe AI → API keys. |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | La URL de tu sitio (`https://TU-SITIO.atlassian.net`), tu correo y un token de <https://id.atlassian.com/manage-profile/security/api-tokens>. |
| `JIRA_PROJECT_KEY` | La key de tu proyecto (por defecto `KAN`). |
| `JIRA_TEAM_*` | Opcional: el id de cada equipo de Atlassian (el final de la URL del equipo, `.../people/team/<id>`). Sin ids, el equipo solo va en el comentario de Jev. |

### 2. Jira

1. Crea un proyecto de software (team-managed), por ejemplo `KAN`.
2. Si tu Jira está en español, los tipos son Error, Historia y Tarea, y ya están mapeados. Si está en inglés, cambia `ISSUE_TYPE` en `demo1-triage/jira.ts` a `Bug`, `Story` y `Task`.
3. Opcional: crea los equipos Pagos, Plataforma, Frontend y Datos en Atlassian y copia sus ids a `.env`.

### 3. Sembrar el backlog

```bash
npm run seed -- --done=8    # crea los 30 tickets sin clasificar y mueve 8 a Finalizada
```

Quedan 22 pendientes con la etiqueta `batch`: son los que clasifica `/lote`.

### 4. Medusa, para la demo 2

```bash
gh repo clone LIDR-academy/medusa ../medusa-fork -- --depth 1    # o define MEDUSA_PATH en .env
```

El ticket "Reembolso parcial se registra como total" toca el servicio de pagos y el proveedor de Stripe de Medusa: 58 funciones de código real, sin bugs sembrados.

### 5. Tu fork con 20 PRs abiertas, para la demo 3

```bash
gh repo fork LIDR-academy/medusa --clone=false     # su develop está fijo en el commit de la demo
node scripts/open-prs.mjs --fork=TU-USUARIO/medusa --path=../medusa-prs --dry-run    # prepara todo en local, no envía nada
node scripts/open-prs.mjs --fork=TU-USUARIO/medusa --path=../medusa-prs              # push + 20 PRs abiertas
npm run import-prs -- --repo=TU-USUARIO/medusa --state=open --count=20 --out=data/prs-fork.json
```

- Usa `--path=../medusa-prs`, no `../medusa-fork`: ese es el clon de solo lectura del paso 4 y no apunta a tu fork.
- Se hace fork de `LIDR-academy/medusa` y no de `medusajs/medusa` porque Medusa avanza a diario: en un fork nuevo de `medusajs/medusa`, los commits de estas PRs pueden quedar demasiado atrás y `open-prs` no los encuentra.
- GitHub deja un solo fork de Medusa por cuenta. Si ya tienes uno, crea este en una organización tuya: `gh repo fork LIDR-academy/medusa --org TU-ORG --clone=false` (y usa `--fork=TU-ORG/medusa`).

El router solo debe comentar en PRs tuyas: `/router` no usa `--comment` si `data/prs-fork.json` no viene de tu fork. Al terminar: `node scripts/open-prs.mjs --fork=TU-USUARIO/medusa --cleanup` cierra las PRs y borra las ramas.

### 6. Los "antes" (todo a Sonnet, sin Jev)

Para comparar, cada demo necesita su "antes". Puedes usar los de ejemplo:

```bash
mkdir -p results && cp results-backup/*direct*.json results/
```

O generar los tuyos sobre tu Jira y tu fork (unos centavos en Sonnet, ~2 min):

```bash
npm run batch -- --mode=direct                              # lee tus issues; no escribe en Jira
npm run scan -- --ticket=KAN-XXX --mode=direct              # KAN-XXX: el issue "Reembolso parcial se registra como total"
npm run review -- --mode=direct --data=data/prs-fork.json
```

## Ejecutar las demos

Abre Claude Code en la raíz del repo:

```text
/triage Pagué con débito y me llegaron dos cargos por el mismo pedido
/lote
/pre-vuelo KAN-XXX solo-jev
/pre-vuelo KAN-XXX
/costos 1,2
/router
/comparar
/costos
```

Qué deberías ver:

- **`/triage`**: el issue nuevo con tipo, prioridad y equipo, cada uno con su %, y la acción (apply). En Jira, el comentario de Jev con cada decisión.
- **`/lote`**: 22 tickets en ~2 s por menos de un décimo de centavo. Casi todos `apply`; los 3 ambiguos ("No funciona", "Cambiar el color del botón de pagar y arreglar el cobro doble", "¿Esto es normal?") se escalan a una persona con la etiqueta `escalado`. "Tipo+equipo OK" compara contra `data/humanreview.json`.
- **`/pre-vuelo … solo-jev`**: 58 funciones en ~1 s; 1 o 2 marcadas. `roundToCurrencyPrecision` sale siempre: su `catch {}` vacío esconde que, con monedas sin decimales (como el yen), el monto queda sin redondear.
- **`/pre-vuelo …`**: Claude explica solo las marcadas. Las demás no gastan tokens de LLM.
- **`/router`**: cada PR con su ruta. Lo trivial va a reglas (cero tokens), lo medio a Haiku, y lo complejo, lo dudoso o lo que toca dinero a Sonnet. Los comentarios aparecen en tus PRs.
- **`/comparar`** y **`/costos`**: el ahorro con Jev en cada demo.

Los números cambian un poco entre ejecuciones, sobre todo en los casos que están justo en el umbral.

### Sin Claude Code

Los mismos pasos con npm:

```bash
npm run triage -- KAN-XXX                            # un issue que ya existe
npm run batch -- --no-create                         # demo 1
npm run scan -- --ticket=KAN-XXX --explain           # demo 2 (sin --explain: solo Jev)
npm run review -- --mode=jev --data=data/prs-fork.json [--comment]   # demo 3
npm run compare
npm run costs
```

## Repetir la demo

```bash
npm run limpiar    # quita lo que hizo Jev en el backlog, borra los issues de /triage y vacía results/ salvo los "antes"; las keys no cambian
npm run reset      # empieza de cero: borra los issues de la demo (después, npm run seed)
```

`limpiar` no toca GitHub: los comentarios del router se quedan en tus PRs hasta que los borres o hagas `--cleanup`.

## Umbrales

Todos en `shared/thresholds.ts`; se pueden mover sin tocar código con estas variables en `.env`:

| Variable | Default | Efecto |
| --- | --- | --- |
| `THRESHOLD_APPLY` | 0.70 | Confianza mínima (la más baja de tipo, prioridad y equipo) para aplicar directo. |
| `THRESHOLD_FLAG` | 0.50 | Entre esto y `APPLY`: aplica y etiqueta `revisar`. Debajo, escala. |
| `THRESHOLD_HUMAN` | 0.50 | Si la probabilidad de que haga falta una persona llega a esto, escala sin tocar el ticket. |
| `SCAN_THRESHOLD` | 0.60 | Pre-vuelo: desde qué probabilidad una señal cuenta como marca. |
| `ROUTER_MONEY_THRESHOLD` | 0.50 | Si la PR toca dinero con esta probabilidad, va a Sonnet siempre. |
| `ROUTER_MIN_CONFIDENCE` | 0.60 | Debajo, la PR va a Sonnet aunque parezca trivial. |

## Límites

- Jev no explica ni razona: elige entre opciones que tú definiste. En la demo 2, Jev dice **dónde** mirar; Claude dice **qué** está mal.
- Como cualquier modelo, es vulnerable a texto malicioso dentro del ticket o la PR. Por eso los umbrales y la revisión humana viven en tu código.
- El ahorro de la demo 3 depende de la mezcla de PRs: con más PRs triviales sube; con más PRs de pagos, baja.
