import type { CampaignDraft } from '@/lib/marketing-draft-data';

/**
 * Carrying a drafted topic from the Calendar screen to the Campaigns screen.
 *
 * The two used to share a page, and the handoff was a function call — which
 * mattered more than it looks. Drafts are written by a language model, so asking
 * the server to draft the same topic again produces DIFFERENT WORDS. A handoff
 * that re-drafts on arrival puts text in the box that is not the text the
 * contractor just read and approved. That was the original bug, fixed once by
 * putting both on one page; splitting them again must not reintroduce it.
 *
 * So the draft travels through sessionStorage:
 *   * it survives a navigation, which a function call cannot;
 *   * it is not a querystring, so it cannot be rewritten by whoever holds the
 *     link, and prose does not end up in browser history;
 *   * it is per-tab, so two tabs drafting two topics do not overwrite each
 *     other;
 *   * it is CONSUMED on read, so a refresh does not resurrect a draft somebody
 *     has already discarded.
 */

const KEY = 'lgq:campaign-draft';

export function stashCampaignDraft(draft: CampaignDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private mode, or storage full. The campaigns page falls back to drafting
    // from ?draft=beat:<id>, which is worse but not broken.
  }
}

/** Read it once and remove it. */
export function takeCampaignDraft(): CampaignDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<CampaignDraft>;
    // Shape-checked rather than trusted: this is still a string somebody could
    // have put there, and a body that is not a string reaches a textarea.
    if (typeof parsed?.body !== 'string' || typeof parsed?.subject !== 'string') return null;
    return {
      channel: 'email',
      audience: typeof parsed.audience === 'string' ? parsed.audience : 'all',
      subject: parsed.subject,
      subjectOptions: Array.isArray(parsed.subjectOptions)
        ? parsed.subjectOptions.filter((option): option is string => typeof option === 'string')
        : [],
      body: parsed.body,
      beatId: typeof parsed.beatId === 'string' ? parsed.beatId : '',
    };
  } catch {
    return null;
  }
}
