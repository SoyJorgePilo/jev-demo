/**
 * Demo 2 · Lo que se le pregunta a Jev por cada función del código que vas a tocar.
 *
 * state:      { file, function, lines, params, signals, similar_to, source }
 * preguntas:  6, en una sola llamada (askJev en scan.ts)
 * después:    flagsFrom() en shared/thresholds.ts convierte las respuestas en marcas con el umbral SCAN.flag.
 *             Solo las funciones con alguna marca van a Claude (--explain).
 *
 * Si Jev marca ruido o se le escapa un bug, se ajusta el texto de las opciones, no el código.
 */
import { choice, noul, score } from "../shared/jev.ts";

export const FUNCTION_QUESTIONS = {
  // Con ejemplos: con el criterio vago, Jev marcaba como "varias" cualquier orquestación (validar → llamar → mapear).
  responsabilidades: choice("¿Cuántas responsabilidades no relacionadas tiene esta función? (principio de responsabilidad única) Juzga los motivos de cambio, no el número de pasos.", {
    una: "Un solo trabajo, aunque tenga varios pasos: validar la entrada, llamar a un servicio o repositorio y mapear o devolver el resultado es UNA responsabilidad (orquestación). Los envoltorios delgados, las delegaciones a un proveedor y los envoltorios transaccionales también cuentan como una.",
    varias: "Mezcla en el mismo cuerpo asuntos que cambian por motivos distintos: p. ej. calcula dinero Y envía un correo Y escribe logs de auditoría o métricas Y cambia el estado del pedido, o reglas de negocio mezcladas con el formato de las notificaciones.",
  }),

  oculta_errores: noul("¿Captura un error y lo oculta devolviendo éxito o un valor inventado, en vez de propagarlo o reportarlo?", {
    true: "Hay un catch que devuelve ok/true, un id falso o un valor por defecto como si nada hubiera pasado",
    false: "Los errores se propagan, se devuelven como error o se registran de forma explícita",
  }),

  muta_entrada: noul("¿Modifica directamente un objeto o arreglo que recibió como parámetro?", {
    true: "Asigna propiedades o hace push sobre un parámetro; quien llamó ve el cambio",
    false: "Trabaja sobre copias o devuelve valores nuevos",
  }),

  numero_magico: noul("¿Usa números literales con significado de negocio sin nombre (tasas, umbrales, porcentajes)?", {
    true: "Aparecen literales como 0.16, 1.16, 0.9 que representan impuestos, umbrales o reglas de negocio",
    false: "Los números están nombrados como constantes o son triviales (0, 1, 100 para redondear)",
  }),

  logica_duplicada: noul("Considerando las funciones similares listadas en similar_to, ¿duplica lógica que ya existe en otra función, con variaciones sutiles?", {
    true: "Reimplementa el mismo cálculo o regla de negocio que otra función listada, pero con fórmula, redondeo o condición distinta",
    false: "No hay función similar, o la similitud es estructural: un método público que delega en su versión privada (create/create_), varios métodos que llaman al mismo proveedor con distinto método, o CRUD con la misma forma",
  }),

  severidad: score("Si un desarrollador toca esta función para la tarea, ¿qué tan probable es que los problemas detectados causen un bug en producción?", [
    "Ninguno: la función está limpia",
    "Bajo: deuda de estilo, no afecta el comportamiento",
    "Medio: puede producir resultados incorrectos en casos borde",
    "Alto: produce cobros, estados o montos incorrectos en casos normales",
  ]),
};
