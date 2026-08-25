import {
  EMAIL_PREVIEW_TABS,
  renderAppointmentReminderEmailHtml,
  renderClientQuoteEmailHtml,
  renderContractorAlertEmailHtml,
  renderSampleEmailPreviewSync,
  type EmailPreviewKind,
  type EmailPreviewResult,
  type SendClientQuoteEmailInput,
} from '@/emails/renderers';
import type { EmailBrand, EmailThemeId } from '@/emails/brand';

export {
  EMAIL_PREVIEW_TABS,
  renderAppointmentReminderEmailHtml,
  renderClientQuoteEmailHtml,
  renderContractorAlertEmailHtml,
  renderSampleEmailPreviewSync,
  type EmailPreviewKind,
  type EmailPreviewResult,
  type SendClientQuoteEmailInput,
};

/**
 * Async wrapper for getSampleEmailPreview for backward compatibility or server actions.
 */
export async function getSampleEmailPreview(
  theme: EmailThemeId,
  kind: EmailPreviewKind,
  brandInput: Partial<EmailBrand> & { businessName?: string },
): Promise<EmailPreviewResult> {
  return renderSampleEmailPreviewSync(theme, kind, brandInput);
}
