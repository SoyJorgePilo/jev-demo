/**
 * Demo 1 · Lo que se le pregunta a Jev por cada ticket de Jira.
 *
 * state:      { title, description, reporter }
 * preguntas:  4, en una sola llamada (askJev en classify.ts)
 * después:    tu código toma la confianza más baja de tipo, prioridad y equipo, y decide()
 *             en shared/thresholds.ts aplica, marca o escala.
 *
 * Si Jev clasifica mal, se ajusta el texto de las opciones, no el código.
 */
import { choice, noul } from "../shared/jev.ts";

export const TICKET_QUESTIONS = {
  tipo: choice("¿Qué tipo de issue es?", {
    bug: "Algo que antes funcionaba y ahora falla",
    feature: "Funcionalidad nueva solicitada",
    deuda_tecnica: "Refactor, limpieza, dependencias, pruebas automatizadas, cumplimiento o mejora interna sin cambio visible para el cliente",
    soporte: "Pregunta o duda de uso, sin cambio de código",
  }),

  // Con ejemplos concretos: con criterios vagos Jev daba "alta" a casi todo con poca confianza.
  prioridad: choice("¿Qué prioridad merece este ticket según su impacto en el negocio hoy? No te guíes por lo alarmante de la redacción.", {
    critica: "Se pierde dinero o se bloquean pedidos ahora mismo en producción. Ejemplos: fallan los pagos de una marca de tarjeta, cobros dobles, reembolsos mal registrados, cupones o pedidos duplicados. Se arregla hoy.",
    alta: "Importante, sin pérdida de dinero inmediata. Ejemplos: login roto en un navegador, sesiones que caducan, vulnerabilidades de seguridad, obligaciones legales o fiscales, nuevos métodos de pago, pruebas del checkout.",
    media: "Molesto pero con alternativa o alcance limitado. Ejemplos: reportes lentos, diseño roto en un dispositivo, errores en búsqueda o exportación, correos o notificaciones que no llegan o llegan tarde, refactors internos, dashboards nuevos, páginas o botones nuevos útiles pero no urgentes.",
    baja: "Cosmético, deseable o una pregunta de cómo usar el producto. Ejemplos: modo oscuro, imágenes algo borrosas, \"¿cómo exporto…?\", \"¿puedo cambiar…?\".",
  }),

  equipo: choice("¿Qué equipo debe atenderlo?", {
    pagos: "Checkout, pasarelas, tarjetas, cupones, facturación, reembolsos",
    plataforma: "Infra, autenticación, sesiones, APIs internas, colas, notificaciones, rendimiento",
    frontend: "UI web o móvil, estilos, imágenes, navegación, páginas o botones nuevos que ve el cliente",
    datos: "Reportes, métricas, búsqueda, exportaciones, pipelines",
  }),

  needs_human: noul("¿El ticket es demasiado ambiguo o contradictorio para clasificarlo sin una persona?", {
    true: "Falta información clave, está vacío o pide dos cosas distintas",
    false: "Tiene suficiente detalle para decidir",
  }),
};
