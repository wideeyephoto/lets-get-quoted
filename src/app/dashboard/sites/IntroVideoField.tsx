'use client';

import { DEFAULT_INTRO_VIDEO_TITLE, type SiteIntroVideoContent } from '@/lib/site-content';
import { parseYouTubeUrl, youTubeThumbnail } from '@/lib/youtube';
import styles from './SiteEditor.module.css';

// Setup for the intro video that plays after a lead submits.
//
// This one control needs a thumbnail where most don't. Every other field in the
// builder can be checked in the live preview beside it; this cannot, because the
// screen it appears on only exists after a stranger has submitted a real request
// — and the builder's preview blocks submissions outright. Without the
// thumbnail, "did I paste the right link?" has no answer short of publishing and
// filling in your own form.

export default function IntroVideoField({
  video,
  onChange,
}: {
  video: SiteIntroVideoContent;
  onChange: (next: SiteIntroVideoContent) => void;
}) {
  const trimmed = video.url.trim();
  const parsed = parseYouTubeUrl(trimmed);

  return (
    <>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={video.enabled}
          onChange={(event) => onChange({ ...video, enabled: event.target.checked })}
        />
        <span>
          <strong>Play a short video once someone submits</strong>
          <small>
            It appears underneath their estimate on the &quot;request sent&quot; screen — never in front of it — and
            it can&apos;t take them off your page.
          </small>
        </span>
      </label>

      {video.enabled && (
        <>
          <label className={styles.formField}>
            <span>YouTube link</span>
            <input
              type="url"
              inputMode="url"
              maxLength={300}
              value={video.url}
              onChange={(event) => onChange({ ...video, url: event.target.value })}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <small>
              {!trimmed
                ? 'Paste the link from YouTube — the address bar, the Share button, or a Shorts link all work.'
                : parsed
                  ? 'Video found. It starts muted with a tap-for-sound control: every browser blocks autoplay with sound, so a silent start is the only one that actually plays.'
                  : 'That doesn’t look like a YouTube link. The video stays hidden until this is fixed — nothing broken will show to a customer.'}
            </small>
          </label>

          <label className={styles.formField}>
            <span>Heading above the video</span>
            <input
              type="text"
              maxLength={60}
              value={video.title}
              onChange={(event) => onChange({ ...video, title: event.target.value })}
              placeholder={DEFAULT_INTRO_VIDEO_TITLE}
            />
          </label>

          {parsed && (
            <div className={styles.introVideoPreview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={youTubeThumbnail(parsed)} alt="" />
              <div>
                <strong>{video.title.trim() || DEFAULT_INTRO_VIDEO_TITLE}</strong>
                <small>
                  This is the video customers will see{parsed.start > 0 ? `, starting at ${formatStart(parsed.start)}` : ''}.
                </small>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function formatStart(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
