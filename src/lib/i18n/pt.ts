/**
 * Portuguese translations for the client job dashboard and platform.
 *
 * Every key in en.ts MUST appear here. If a translation is missing at runtime,
 * the system falls back to English automatically.
 */
const pt: Record<string, string> = {
  // --- Status labels ---
  'payment.status.requested': 'Aguardando pagamento',
  'payment.status.processing': 'Processando',
  'payment.status.paid': 'Pago',
  'payment.status.failed': 'Falhou',
  'payment.status.refunded': 'Reembolsado',

  'invoice.status.draft': 'Rascunho',
  'invoice.status.sent': 'Enviada',
  'invoice.status.signed': 'Assinada',
  'invoice.status.paid': 'Paga',
  'invoice.status.void': 'Cancelada',

  'freq.label.weekly': '/sem',
  'freq.label.biweekly': '/2sem',
  'freq.label.monthly': '/mês',
  'freq.word.weekly': 'semanal',
  'freq.word.biweekly': 'a cada duas semanas',
  'freq.word.monthly': 'mensal',

  // --- Flash messages ---
  'flash.approved': 'Obrigado — sua aprovação foi registrada e seu contratado foi notificado.',
  'flash.scheduled': 'Sua data de início está confirmada. Seu contratado já pode vê-la.',
  'flash.schedule-requested': 'Enviado. Seu contratado enviará diferentes opções de datas.',
  'flash.asked': 'Sua dúvida foi enviada. O orçamento permanece aberto enquanto aguarda resposta.',
  'flash.ask-failed': 'Não foi possível enviar a pergunta. Tente novamente ou ligue para o número no topo desta página.',
  'flash.options-updated': 'Suas opções foram atualizadas e seu contratado foi avisado. Seu novo total está abaixo.',
  'flash.options-failed': 'Não foi possível atualizar essas opções. Seu orçamento não foi alterado — ligue para seu contratado.',

  // --- Expired / dead-link screen ---
  'expired.eyebrow': 'Este link expirou',
  'expired.title': 'Este link de orçamento não está mais ativo',
  'expired.body1': 'Links expiram e um contratado pode encerrá-los a qualquer momento — geralmente porque o orçamento foi substituído por um mais recente ou o trabalho foi concluído.',
  'expired.body2': 'Nada foi perdido. Responda à mensagem de texto ou e-mail que você recebeu solicitando um novo link.',

  // --- Section headings & labels ---
  'section.quote': 'Seu orçamento',
  'section.scopeAndPricing': 'Escopo e valores',
  'section.approveAndBook': 'Aprovar e agendar data',
  'section.payments': 'Solicitações de pagamento',
  'section.invoices': 'Faturas',
  'section.paymentPlan': 'Plano de pagamento',
  'section.changeOrders': 'Ordens de alteração',
  'section.selections': 'Seleções',
  'section.forms': 'Formulários e documentos',

  // --- Common UI ---
  'ui.view': 'Visualizar',
  'ui.pay': 'Pagar',
  'ui.call': 'Ligar',
  'ui.approve': 'Aprovar',
  'ui.decline': 'Recusar',
  'ui.submit': 'Enviar',
  'ui.cancel': 'Cancelar',
  'ui.sendQuestion': 'Enviar uma pergunta',
  'ui.questionPlaceholder': 'Digite sua dúvida aqui…',
  'ui.total': 'Total',
  'ui.deposit': 'Entrada / Depósito',
  'ui.balanceDue': 'Saldo restante',
  'ui.paidInFull': 'Pago integralmente',
  'ui.scheduledFor': 'Agendado para',
  'ui.requestNewDates': 'Solicitar novas datas',
};

export default pt;
