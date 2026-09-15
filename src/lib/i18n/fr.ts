/**
 * French translations for the client job dashboard and platform.
 *
 * Every key in en.ts MUST appear here. If a translation is missing at runtime,
 * the system falls back to English automatically.
 */
const fr: Record<string, string> = {
  // --- Status labels ---
  'payment.status.requested': 'En attente de paiement',
  'payment.status.processing': 'Traitement en cours',
  'payment.status.paid': 'Payé',
  'payment.status.failed': 'Échec',
  'payment.status.refunded': 'Remboursé',

  'invoice.status.draft': 'Brouillon',
  'invoice.status.sent': 'Envoyée',
  'invoice.status.signed': 'Signée',
  'invoice.status.paid': 'Payée',
  'invoice.status.void': 'Annulée',

  'freq.label.weekly': '/sem',
  'freq.label.biweekly': '/2sem',
  'freq.label.monthly': '/mois',
  'freq.word.weekly': 'hebdomadaire',
  'freq.word.biweekly': 'toutes les deux semaines',
  'freq.word.monthly': 'mensuel',

  // --- Flash messages ---
  'flash.approved': 'Merci — votre approbation a été enregistrée et votre entrepreneur a été notifié.',
  'flash.scheduled': 'Votre date de début est confirmée. Votre entrepreneur peut maintenant la voir.',
  'flash.schedule-requested': 'Envoyé. Votre entrepreneur vous proposera d’autres dates au choix.',
  'flash.asked': 'Votre question a été envoyée. Le devis reste ouvert en attendant sa réponse.',
  'flash.ask-failed': 'L’envoi de la question a échoué. Veuillez réessayer ou appeler le numéro en haut de page.',
  'flash.options-updated': 'Vos options ont été mises à jour et votre entrepreneur a été informé. Votre nouveau total figure ci-dessous.',
  'flash.options-failed': 'Impossible de modifier ces options. Votre devis reste inchangé — veuillez appeler votre entrepreneur.',

  // --- Expired / dead-link screen ---
  'expired.eyebrow': 'Ce lien est expiré',
  'expired.title': 'Ce lien de devis n’est plus actif',
  'expired.body1': 'Les liens expirent et un entrepreneur peut les clôturer à tout moment — généralement parce que le devis a été remplacé ou le travail est terminé.',
  'expired.body2': 'Rien n’est perdu. Répondez au message texte ou au courriel reçu pour demander un nouveau lien actif.',

  // --- Section headings & labels ---
  'section.quote': 'Votre devis',
  'section.scopeAndPricing': 'Portée et tarification',
  'section.approveAndBook': 'Approuver et réserver une date',
  'section.payments': 'Demandes de paiement',
  'section.invoices': 'Factures',
  'section.paymentPlan': 'Plan de paiement',
  'section.changeOrders': 'Avenants et modifications',
  'section.selections': 'Sélections',
  'section.forms': 'Formulaires et documents',

  // --- Common UI ---
  'ui.view': 'Afficher',
  'ui.pay': 'Payer',
  'ui.call': 'Appeler',
  'ui.approve': 'Approuver',
  'ui.decline': 'Refuser',
  'ui.submit': 'Soumettre',
  'ui.cancel': 'Annuler',
  'ui.sendQuestion': 'Poser une question',
  'ui.questionPlaceholder': 'Écrivez votre question ici…',
  'ui.total': 'Total',
  'ui.deposit': 'Acompte',
  'ui.balanceDue': 'Solde dû',
  'ui.paidInFull': 'Entièrement payé',
  'ui.scheduledFor': 'Planifié pour le',
  'ui.requestNewDates': 'Demander d’autres dates',
};

export default fr;
