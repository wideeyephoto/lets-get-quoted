'use client';

import { useEffect, useRef, useState } from 'react';
import { StyleGlyph, StylePreview } from '@/app/dashboard/sites/VideoStudio';
import {
  MAX_VIDEO_SECTIONS,
  VIDEO_SECTION_STYLES,
  videoStyleCapacity,
  type SiteVideoItem,
  type SiteVideoSectionContent,
  type SiteVideoStyle,
} from '@/lib/site-content';
import { formatVideoDuration, VIDEO_FILE_ACCEPT } from '@/lib/video-source';
import styles from '@/app/dashboard/sites/SiteEditor.module.css';

// The video studio, for somebody who hasn't signed up yet.
//
// The real one (dashboard/sites/VideoStudio) imports its upload and delete
// server actions directly, so it cannot be handed no-op props the way
// CashFlowBoard and FocusView can — this is a rebuild, and the demo's rule
// applies: rebuild the shell, reuse everything that would otherwise drift. The
// six style glyphs and the section preview are imported from the real studio,
// so a prospect comparing layouts is looking at the product's own drawings.
//
// The uploader is the point of the whole panel. "You can put video on your site"
// is a claim; watching a file you picked climb to 100% and appear as a clip in
// the layout you chose is the thing that actually lands. Nothing leaves the
// browser — see fakeUpload.

const POSTER = (seed: string) =>
  `https://images.unsplash.com/${seed}?auto=format&fit=crop&w=480&q=60`;

function clip(over: Partial<SiteVideoItem> & { id: string }): SiteVideoItem {
  return { url: 'demo://clip', posterUrl: '', label: '', duration: 0, quote: '', author: '', authorLabel: '', ...over };
}

// Three sections, deliberately three DIFFERENT jobs a video can do on a page:
// open it, prove the work, and let a customer do the convincing.
const DEMO_SECTIONS: SiteVideoSectionContent[] = [
  {
    id: 'video-1',
    enabled: true,
    style: 'split',
    eyebrow: 'Meet the owner',
    headline: 'Twelve years on Royal Oak roofs',
    body: 'Dana walks you through how an Evergreen estimate works, what the crew does on day one, and why the yard gets left cleaner than they found it.',
    ctaLabel: 'Get my estimate',
    ctaHref: '#quote',
    location: '',
    timeline: '',
    service: '',
    steps: [],
    autoplay: true,
    loop: true,
    controls: false,
    overlay: 45,
    // A phone gets the still frame and a play button rather than an autoplaying
    // clip — the default the real builder ships, and the one that respects a
    // homeowner's data plan.
    mobilePoster: true,
    videos: [clip({ id: 'v1', posterUrl: POSTER('photo-1581578731548-c64695cc6952'), label: 'Owner introduction', duration: 74 })],
  },
  {
    id: 'video-2',
    enabled: true,
    style: 'story',
    eyebrow: '',
    headline: 'A dead lawn to a full backyard in nine days',
    body: 'Grading, topsoil, hydroseed and a paver path — filmed start to finish so a homeowner can see the mess phase as well as the reveal.',
    ctaLabel: 'Start a project like this',
    ctaHref: '#quote',
    location: 'Berkley, MI',
    timeline: '9 days',
    service: 'Full backyard install',
    steps: [],
    autoplay: true,
    loop: true,
    controls: false,
    overlay: 45,
    // A phone gets the still frame and a play button rather than an autoplaying
    // clip — the default the real builder ships, and the one that respects a
    // homeowner's data plan.
    mobilePoster: true,
    videos: [clip({ id: 'v2', posterUrl: POSTER('photo-1558904541-efa843a96f01'), label: 'Rosewood Ct', duration: 128 })],
  },
  {
    id: 'video-3',
    enabled: true,
    style: 'testimonial',
    eyebrow: 'In their words',
    headline: 'What the neighbours say',
    body: '',
    ctaLabel: '',
    ctaHref: '',
    location: '',
    timeline: '',
    service: '',
    steps: [],
    autoplay: true,
    loop: true,
    controls: false,
    overlay: 45,
    // A phone gets the still frame and a play button rather than an autoplaying
    // clip — the default the real builder ships, and the one that respects a
    // homeowner's data plan.
    mobilePoster: true,
    videos: [
      clip({
        id: 'v3',
        posterUrl: POSTER('photo-1544005313-94ddf0286df2'),
        quote: 'They showed up when they said, and the patio is better than the drawing. I have already given their number to two people on this street.',
        author: 'Renee Patterson',
        authorLabel: 'Berkley homeowner',
        duration: 41,
      }),
    ],
  },
];

type UploadState = { name: string; percent: number; done: boolean } | null;

export default function DemoVideoStudio() {
  const [sections, setSections] = useState(DEMO_SECTIONS);
  const [activeId, setActiveId] = useState(DEMO_SECTIONS[0].id);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [upload, setUpload] = useState<UploadState>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const active = sections.find((section) => section.id === activeId) ?? sections[0];
  const capacity = videoStyleCapacity(active.style);
  const shown = active.videos.slice(0, capacity);

  function patch(next: Partial<SiteVideoSectionContent>) {
    setSections((current) => current.map((section) => (section.id === active.id ? { ...section, ...next } : section)));
  }

  /**
   * The upload, without an upload.
   *
   * Runs the real one's states — picked, climbing, done — off a timer, then adds
   * the file as a clip using a local object URL for the poster. The file never
   * leaves the browser: there is no account to store it against, and a demo that
   * quietly uploaded a stranger's video somewhere would be a worse thing than a
   * demo with no uploader at all.
   */
  function fakeUpload(file: File) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setUpload({ name: file.name, percent: 0, done: false });

    [18, 41, 63, 82, 96].forEach((percent, index) => {
      timers.current.push(setTimeout(() => setUpload((u) => (u ? { ...u, percent } : u)), 220 * (index + 1)));
    });

    timers.current.push(
      setTimeout(() => {
        setUpload({ name: file.name, percent: 100, done: true });
        const poster = URL.createObjectURL(file);
        patch({
          videos: [
            ...active.videos,
            clip({ id: `demo-${Date.now()}`, posterUrl: poster, label: file.name.replace(/\.[^.]+$/, ''), duration: 0 }),
          ].slice(0, capacity),
        });
      }, 1400),
    );
    timers.current.push(setTimeout(() => setUpload(null), 3200));
  }

  return (
    <section className="panel workspace-section-card demo-vstudio">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Website · video</p>
        <h2>Put your work on the page</h2>
        <p className="workspace-card-copy">
          Six arrangements, up to four bands on a page. Pick a layout and your videos and words move into it —
          nothing you have written is lost when you switch. Try uploading something: it stays in your browser.
        </p>
      </div>

      {/* Which band is being edited. The real builder lists these down the rail;
          here they are tabs, because there is no rail on this page. */}
      <div className="demo-vstudio-tabs" role="tablist" aria-label="Video sections">
        {sections.map((section, index) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={section.id === activeId}
            className={`demo-vstudio-tab${section.id === activeId ? ' is-on' : ''}`}
            onClick={() => setActiveId(section.id)}
          >
            <span>Video {index + 1}</span>
            <small>{VIDEO_SECTION_STYLES.find((style) => style.key === section.style)?.label}</small>
          </button>
        ))}
        <span className="demo-vstudio-cap">{sections.length} of {MAX_VIDEO_SECTIONS} bands used</span>
      </div>

      {/* The real style strip, drawn by the real glyphs. */}
      <div className={styles.vsStyleStrip} role="radiogroup" aria-label="Section style">
        {VIDEO_SECTION_STYLES.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active.style === option.key}
            className={`${styles.vsStyleBtn}${active.style === option.key ? ` ${styles.vsStyleBtnOn}` : ''}`}
            onClick={() => patch({ style: option.key as SiteVideoStyle })}
            title={option.desc}
          >
            <StyleGlyph style={option.key} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.vsBody}>
        <div className={styles.vsPreviewPane}>
          <div className={styles.vsPreviewHead}>
            <span>Live section preview</span>
            <div className={styles.vsDeviceToggle} role="group" aria-label="Preview width">
              <button type="button" className={device === 'desktop' ? styles.vsDeviceOn : undefined} onClick={() => setDevice('desktop')}>Desktop</button>
              <button type="button" className={device === 'mobile' ? styles.vsDeviceOn : undefined} onClick={() => setDevice('mobile')}>Mobile</button>
            </div>
          </div>
          <div className={`${styles.vsPreviewStage}${device === 'mobile' ? ` ${styles.vsPreviewMobile}` : ''}`}>
            <StylePreview content={active} videos={shown} />
          </div>
          <p className={styles.vsPreviewNote}>{VIDEO_SECTION_STYLES.find((style) => style.key === active.style)?.desc}</p>
        </div>

        <div className={styles.vsControls}>
          <div className={styles.contentSubhead}>
            <strong>Video source</strong>
            <small>{shown.length === 0 ? 'none yet' : `${shown.length} of ${capacity} used`}</small>
          </div>

          {shown.map((item, index) => (
            <div key={item.id} className={styles.vsVideoRow}>
              <div className={styles.vsThumb}>
                {/* eslint-disable-next-line @next/next/no-img-element -- fictional posters + local object URLs */}
                {item.posterUrl ? <img src={item.posterUrl} alt="" /> : <span aria-hidden="true">▶</span>}
                {item.duration ? <em>{formatVideoDuration(item.duration)}</em> : null}
              </div>
              <div className={styles.vsVideoMeta}>
                <strong>Uploaded file{capacity > 1 ? ` · ${index + 1}` : ''}</strong>
                <div className={styles.vsRowActions}>
                  <button type="button" disabled title="Read-only in the demo">Replace</button>
                  <button type="button" disabled title="Read-only in the demo">Link</button>
                  <button
                    type="button"
                    className={styles.vsRowRemove}
                    onClick={() => patch({ videos: active.videos.filter((video) => video.id !== item.id) })}
                    aria-label="Remove this video"
                  >
                    ✕
                  </button>
                </div>
                {active.style === 'reel' ? (
                  <input className={styles.vsInlineInput} value={item.label} readOnly placeholder="Caption on the tile" />
                ) : null}
                {active.style === 'testimonial' ? (
                  <>
                    <textarea className={styles.vsInlineInput} rows={2} value={item.quote} readOnly />
                    <div className={styles.vsInlinePair}>
                      <input className={styles.vsInlineInput} value={item.author} readOnly />
                      <input className={styles.vsInlineInput} value={item.authorLabel} readOnly />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ))}

          {upload ? (
            <div className="demo-upload" role="status" aria-live="polite">
              <div className="demo-upload-top">
                <strong>{upload.done ? 'Added to this section' : 'Uploading'}</strong>
                <span>{upload.percent}%</span>
              </div>
              <div className="demo-upload-track">
                <i style={{ width: `${upload.percent}%` }} />
              </div>
              <small>{upload.name}</small>
            </div>
          ) : null}

          {shown.length < capacity ? (
            <div className={styles.vsAddRow}>
              <label className={styles.blogCoverUpload}>
                <input
                  type="file"
                  accept={VIDEO_FILE_ACCEPT}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = '';
                    if (file) fakeUpload(file);
                  }}
                />
                <span>{upload && !upload.done ? 'Uploading…' : '⬆ Upload a video'}</span>
              </label>
              <button type="button" className={styles.secondaryAction} disabled title="Read-only in the demo">
                Use a YouTube link
              </button>
            </div>
          ) : null}

          <p className={styles.fieldHint}>
            Up to 50 MB — about 45 seconds of phone video. Vertical clips work well in the Reel gallery.
            {' '}
            <strong>In this demo nothing is uploaded:</strong> the file you pick stays in your browser and is gone when
            you close the tab.
          </p>
        </div>
      </div>
    </section>
  );
}
