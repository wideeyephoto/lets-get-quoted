import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const RECORD_PHOTOS = read('src', 'app', 'dashboard', 'RecordPhotos.tsx');
const GALLERY = read('src', 'components', 'photo-gallery.tsx');
const FOCUS_CSS = read('src', 'app', 'dashboard', 'focus.module.css');
const JOB_ROUTE = read('src', 'app', 'api', 'job-photos', 'route.ts');
const LEAD_ROUTE = read('src', 'app', 'api', 'lead-photos', 'route.ts');

/**
 * EVERY OVERVIEW THAT OPENS ON ONE RECORD IS ON THIS LIST.
 *
 * Leads' Smoothie pane was missing from it, and so was the cover — the only one
 * of the four panes that opened on a bare heading while Jobs' Smoothie, Clients'
 * Smoothie and Leads' own Focus all led with a picture. LeadViewItem had been
 * carrying `projectType` and `photoCount` for exactly this the whole time.
 *
 * Adding a pane here without adding the cover fails three tests below, which is
 * the point of the list.
 */
const VIEWS = {
  'jobs/FocusView': read('src', 'app', 'dashboard', 'jobs', 'FocusView.tsx'),
  'jobs/JobSmoothieView': read('src', 'app', 'dashboard', 'jobs', 'JobSmoothieView.tsx'),
  'leads/LeadFocusView': read('src', 'app', 'dashboard', 'leads', 'LeadFocusView.tsx'),
  'leads/LeadSmoothieView': read('src', 'app', 'dashboard', 'leads', 'LeadSmoothieView.tsx'),
};

const SMOOTHIE_CSS = read('src', 'app', 'dashboard', 'smoothie.module.css');

/**
 * The cover on the leads and jobs overviews opens every photo on the record,
 * and takes more. It used to be a picture with a "+7" on it and nothing behind
 * the click.
 */
describe('the record photo dialog', () => {
  it('is wired into every overview that shows a cover', () => {
    for (const [name, source] of Object.entries(VIEWS)) {
      expect(source, `${name} still renders the bare cover`).toContain('<RecordPhotos');
      expect(source, `${name} does not say which kind of record it is`).toMatch(/kind="(job|lead)"/);
    }
  });

  /**
   * The demo renders these very components against a fixed dataset with no
   * session, and every route behind the dialog requires an owner. Without this
   * the demo's covers open a panel that can only say "Sign in to manage photos".
   */
  it('keeps the trigger off the logged-out demo', () => {
    for (const [name, source] of Object.entries(VIEWS)) {
      expect(source, `${name} would open the dialog in the demo`).toMatch(
        /canOpen=\{base === '\/dashboard'\}/,
      );
    }
    // ...and the component honours it by falling back to a plain cover.
    expect(RECORD_PHOTOS).toMatch(/if \(!canOpen\) \{\s*return \(\s*<RecordCover/);
  });

  /**
   * The dialog fetches instead of reading the photos the overview already holds,
   * because that payload is capped at FOCUS_PHOTO_LIMIT (8) while the count
   * beside it is the true one. Read from the payload and a job with twelve
   * photos shows "+7" on the cover and then eight pictures.
   */
  it('asks the server for all of them rather than reusing the capped payload', () => {
    expect(RECORD_PHOTOS).toMatch(/fetch\(`\$\{config\.url\}\?\$\{config\.query\}=/);
    for (const [name, route] of [['job', JOB_ROUTE], ['lead', LEAD_ROUTE]] as const) {
      expect(route, `${name} photos have no GET`).toMatch(/export async function GET/);
      // No slice: this endpoint exists precisely to not be the capped one.
      expect(route).not.toMatch(/GET[\s\S]*?\.slice\(0,/);
    }
  });

  // Owner-gated like every other verb on these routes — it hands out signed URLs.
  it('gates the new GET behind the same owner check as the rest of the route', () => {
    for (const [name, route] of [['job', JOB_ROUTE], ['lead', LEAD_ROUTE]] as const) {
      const get = route.slice(route.indexOf('export async function GET'));
      const body = get.slice(0, get.indexOf('export async function POST'));
      expect(body, `${name} GET is not owner-gated`).toContain('await requireOwnerMembership()');
      expect(body).toContain('if (auth.error) return auth.error;');
    }
  });

  /**
   * The cover behind the dialog is drawn from the list payload the server sent,
   * so adding the first photo would otherwise leave "No photos" sitting under a
   * dialog that just accepted one. Refreshed on the way out, and only when the
   * count actually moved.
   */
  it('refreshes the page behind it only when something changed', () => {
    expect(GALLERY).toContain('onPhotosChange?: (photos: GalleryPhoto[]) => void;');
    expect(RECORD_PHOTOS).toContain('onPhotosChange=');
    expect(RECORD_PHOTOS).toMatch(/liveCount\.current !== openedWith\.current\) router\.refresh\(\)/);
  });

  /**
   * RecordCover is a <figure> — flow content, not valid inside a <button> — so
   * the trigger is stretched over it instead of wrapped around it. The slot has
   * to be positioned for that to land anywhere near the cover.
   */
  it('overlays the trigger rather than nesting the figure in a button', () => {
    expect(FOCUS_CSS).toMatch(/\.coverSlot \{[^}]*position: relative/);
    expect(FOCUS_CSS).toMatch(/\.coverOpen \{[^}]*position: absolute;\s*inset: 0;/);
    expect(RECORD_PHOTOS).toMatch(/triggerClassName=\{styles\.coverOpen\}/);
  });

  // Touch has no hover, so the invitation cannot depend on one.
  it('shows the way in on touch, where there is no hover', () => {
    expect(FOCUS_CSS).toMatch(/@media \(hover: none\) \{\s*\.coverOpen \{[^}]*opacity: 1/);
  });

  /**
   * The cover and the heading sit side by side in a flex row that all three
   * smoothie panes share. It was called .jobHeadLayout, after the first pane to
   * get one — and a shared class named for one of its four users reads like it
   * belongs to that user, which is part of why Leads went without.
   */
  it('names the shared head layout for the record, not for jobs', () => {
    expect(SMOOTHIE_CSS).toContain('.recordHeadLayout {');
    expect(SMOOTHIE_CSS).toContain('.recordHeadCopy {');
    expect(SMOOTHIE_CSS).not.toContain('.jobHeadLayout');
    for (const pane of ['jobs/JobSmoothieView', 'leads/LeadSmoothieView'] as const) {
      expect(VIEWS[pane], pane).toContain('styles.recordHeadLayout');
    }
  });
});
