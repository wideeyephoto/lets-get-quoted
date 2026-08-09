/**
 * The result of trying to add a crew member.
 *
 * IN ITS OWN MODULE BECAUSE A 'use server' FILE MAY ONLY EXPORT ASYNC FUNCTIONS.
 * This lived beside createCrewAction, which reads naturally — the state and the
 * action that produces it, together. But the `idle` constant is an object, and
 * Next refuses a server-actions file that exports one:
 *
 *   Error: A "use server" file can only export async functions, found object.
 *
 * The type alone would have been fine (types are erased before that check ever
 * runs); the constant is what broke it. Worth knowing that the failure does NOT
 * show up in `tsc`, in `next lint`, or in "Compiled successfully" — it surfaces
 * only when the build collects page data, and it took down an unrelated route
 * in the message, which is a long way from the file that caused it.
 *
 * Client-safe by construction: no imports, no IO, so the drawer can read the
 * initial state without pulling the server action's whole dependency graph into
 * the browser bundle.
 */

export type CreateCrewState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'added';
      /**
       * The reason 'added' carries more than a message: the roster scrolls to
       * and focuses the new card, and it can only find it by id.
       */
      id: string;
      name: string;
      message: string;
      /** Whether the field-app invitation went out, and if not, why not. */
      invite: 'sent' | 'skipped' | 'no-email' | 'failed';
    };

export const CREATE_CREW_IDLE: CreateCrewState = { status: 'idle' };
