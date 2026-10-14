/**
 * Demo 3 · Lo que se le pregunta a Jev por cada PR.
 *
 * state:      { title, files, changed_files, additions, deletions, description, diff_summary }
 * preguntas:  2, en una sola llamada (askJev en router.ts)
 * después:    routeFor() en shared/thresholds.ts elige la ruta: reglas, Haiku o Sonnet.
 *             Lo que toca dinero o deja dudas siempre va a Sonnet.
 *
 * Si una PR trivial se va a Sonnet, se ajusta el texto de las opciones, no el código.
 */
import { choice, noul } from "../shared/jev.ts";

export const PR_QUESTIONS = {
  complejidad: choice("¿Qué tan complejo es revisar este cambio con criterio de un revisor senior?", {
    trivial: "Typos, docs, formato, renombrar, bumps de versión rutinarios, cambios sin lógica",
    media: "Refactor acotado, endpoint nuevo, lógica simple, pruebas, i18n con lógica",
    alta: "Pagos, reembolsos, créditos, auth/sesiones, migraciones, concurrencia, colas, seguridad, cambios que tocan muchos paquetes",
  }),

  touches_money: noul("¿El cambio toca cobros, pagos, reembolsos, créditos, gift cards o datos financieros?", {
    true: "Modifica flujos o registros de dinero",
    false: "No toca dinero",
  }),
};
