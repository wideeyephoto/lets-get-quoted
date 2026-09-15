/**
 * Spanish translations for the client job dashboard (/client/jobs/[token]).
 *
 * Every key in en.ts MUST appear here. If a translation is missing at runtime,
 * the system falls back to English automatically.
 */
const es: Record<string, string> = {
  // --- Status labels ---
  'payment.status.requested': 'Esperando pago',
  'payment.status.processing': 'Procesando',
  'payment.status.paid': 'Pagado',
  'payment.status.failed': 'Fallido',
  'payment.status.refunded': 'Reembolsado',

  'invoice.status.draft': 'Borrador',
  'invoice.status.sent': 'Enviada',
  'invoice.status.signed': 'Firmada',
  'invoice.status.paid': 'Pagada',
  'invoice.status.void': 'Anulada',

  'freq.label.weekly': '/sem',
  'freq.label.biweekly': '/2sem',
  'freq.label.monthly': '/mes',
  'freq.word.weekly': 'semanal',
  'freq.word.biweekly': 'cada dos semanas',
  'freq.word.monthly': 'mensual',

  // --- Flash messages ---
  'flash.approved': 'Gracias — su aprobación ha sido registrada y su contratista ha sido notificado.',
  'flash.scheduled': 'Su fecha de inicio está confirmada. Su contratista ya puede verla.',
  'flash.schedule-requested': 'Enviado. Su contratista le enviará diferentes fechas para elegir.',
  'flash.asked': 'Su pregunta está en camino. La cotización permanece abierta mientras responden.',
  'flash.ask-failed': 'Esa pregunta no se envió. Por favor intente de nuevo, o llame al número en la parte superior de esta página.',
  'flash.options-updated': 'Sus opciones están actualizadas y su contratista ha sido informado. Su nuevo total está abajo.',
  'flash.options-failed': 'No pudimos cambiar esas opciones. Su cotización no ha cambiado — por favor llame a su contratista.',

  // --- Expired / dead-link screen ---
  'expired.eyebrow': 'Este enlace ha cerrado',
  'expired.title': 'Este enlace de cotización ya no está activo',
  'expired.body1': 'Los enlaces expiran, y un contratista puede cerrar uno en cualquier momento — generalmente porque la cotización fue reemplazada por una más nueva, o el trabajo está terminado.',
  'expired.body2': 'Nada se pierde. Responda al mensaje de texto o correo electrónico en el que lo recibió y solicite un nuevo enlace, y se abrirá justo donde estaba este.',

  // --- Section headings & labels ---
  'section.quote': 'Su cotización',
  'section.scopeAndPricing': 'Alcance y precios',
  'section.approveAndBook': 'Aprobar y reservar una fecha',
  'section.payments': 'Solicitudes de pago',
  'section.invoices': 'Facturas',
  'section.paymentPlan': 'Plan de pago',
  'section.changeOrders': 'Órdenes de cambio',
  'section.selections': 'Selecciones',
  'section.forms': 'Formularios y documentos',

  // --- Common UI ---
  'ui.view': 'Ver',
  'ui.pay': 'Pagar',
  'ui.call': 'Llamar',
  'ui.approve': 'Aprobar',
  'ui.decline': 'Rechazar',
  'ui.submit': 'Enviar',
  'ui.cancel': 'Cancelar',
  'ui.sendQuestion': 'Enviar una pregunta',
  'ui.questionPlaceholder': 'Escriba su pregunta aquí…',
  'ui.total': 'Total',
  'ui.deposit': 'Depósito',
  'ui.balanceDue': 'Saldo pendiente',
  'ui.paidInFull': 'Pagado en su totalidad',
  'ui.scheduledFor': 'Programado para',
  'ui.requestNewDates': 'Solicitar nuevas fechas',
};

export default es;
