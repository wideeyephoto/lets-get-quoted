/**
 * The result of trying to save the owner's own notification settings.
 *
 * IN ITS OWN MODULE FOR TWO REASONS, and both have bitten this codebase before.
 *
 * A 'use server' file may only export async functions — an exported object
 * constant fails the build's page-data collection with an error that does not
 * appear in tsc, in next lint, or in "Compiled successfully", and that names an
 * unrelated route. See lib/crew-add-state for the same note.
 *
 * And lib/owner-sms, where the rest of this feature lives, imports the Supabase
 * admin client. The form is a client component; importing the idle state from
 * there would drag a service-role client into the browser bundle's module
 * graph. Nothing here imports anything, on purpose.
 */

export type OwnerAlertsState =
  | { status: 'idle' }
  /**
   * Errors are keyed by field so the message lands under the input it is about,
   * and the dialog stays OPEN. A validation failure that closes the dialog and
   * reports itself somewhere else is how somebody ends up believing they saved.
   */
  | { status: 'error'; errors: { field: 'phone' | 'consent' | 'form'; message: string }[] }
  | { status: 'saved'; message: string };

export const OWNER_ALERTS_IDLE: OwnerAlertsState = { status: 'idle' };
