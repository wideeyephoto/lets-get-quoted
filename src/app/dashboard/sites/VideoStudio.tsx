'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  MAX_VIDEO_ITEMS,
  MAX_VIDEO_STEPS,
  VIDEO_SECTION_STYLES,
  videoStyleCapacity,
  type SiteVideoItem,
  type SiteVideoSectionContent,
  type SiteVideoStyle,
} from '@/lib/site-content';
import { formatVideoDuration, isPlayableVideoUrl, parseVideoSource, videoPoster, VIDEO_FILE_ACCEPT } from '@/lib/video-source';
import { deleteSiteVideoAction } from './actions';
import { uploadSiteVideo, videoUploadError } from './video-upload';
import styles from './SiteEditor.module.css';

// The video studio.
//
// It exists as its own popup for one reason: the thing an owner is actually
// choosing here is a LAYOUT, and a layout can't be judged from a list of form
// fields in a 480px rail. Style strip, a preview of what that style does with
// their content, and the fields — side by side, at a width where the comparison
// is possible.
//
// The rule the whole screen is built around: switching style rearranges, never
// asks again. Every field lives on one content object shared by all six styles,
// so a headline typed under "Video + text" is already there under "Testimonial",
// and the quote a testimonial needed is still saved after switching away. The
// only thing a style change alters is which fields are on screen.

type VideoStudioProps = {
  content: SiteVideoSectionContent;
  onChange: (next: SiteVideoSectionContent) => void;
  onClose: () => void;
};

// What each style actually lays out. Drives the "also used by this style"
// fields and the honest note about what is saved but not currently shown.
const STYLE_FIELDS: Record<SiteVideoStyle, { uses: string[]; bestFor: string }> = {
  hero: {
    uses: ['Small line above', 'Headline', 'Description', 'Button'],
    bestFor: 'Best as a bold opener — one clip playing behind your headline.',
  },
  split: {
    uses: ['Small line above', 'Headline', 'Description', 'Button'],
    bestFor: 'Best for an owner introduction or service explanation with enough room for supporting text.',
  },
  story: {
    uses: ['Location', 'Headline', 'Description', 'Timeline', 'Service', 'Button'],
    bestFor: 'Best for turning a finished job into a mini case study with location, service, and timeline.',
  },
  reel: {
    uses: ['Small line above', 'Headline', 'Description', 'A caption per clip', 'Button'],
    bestFor: 'Best for vertical phone footage, quick transformations, and a browsable portfolio of recent work.',
  },
  testimonial: {
    uses: ['Small line above', 'Headline', 'A quote + name per clip'],
    bestFor: 'Best near reviews or the final call to action, where homeowner proof can do the convincing.',
  },
  process: {
    uses: ['Small line above', 'Headline', 'Description', 'Numbered steps', 'Button'],
    bestFor: 'Best for explaining what happens after a homeowner requests an estimate.',
  },
};

function newVideoId() {
  return `vid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function blankVideo(): SiteVideoItem {
  return { id: newVideoId(), url: '', posterUrl: '', label: '', duration: 0, playbackWarning: '', quote: '', author: '', authorLabel: '' };
}

export default function VideoStudio({ content, onChange, onClose }: VideoStudioProps) {
  const [mounted, setMounted] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [advanced, setAdvanced] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which row's "paste a link" field is open; null when none is.
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState('');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const capacity = videoStyleCapacity(content.style);
  const shown = content.videos.slice(0, capacity);
  // Clips this style has no room for. They are NOT deleted — that is the whole
  // point — so the owner is told where they went instead of wondering.
  const parked = content.videos.length - shown.length;

  const setVideos = (videos: SiteVideoItem[]) => onChange({ ...content, videos: videos.slice(0, MAX_VIDEO_ITEMS) });

  const patchVideo = (id: string, patch: Partial<SiteVideoItem>) =>
    setVideos(content.videos.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const removeVideo = (item: SiteVideoItem) => {
    setVideos(content.videos.filter((other) => other.id !== item.id));
    // Best effort: an orphaned file in storage is a much smaller problem than
    // refusing to let someone take a video off their own website.
    if (item.url) void deleteSiteVideoAction(item.url).catch(() => {});
  };

  const handleUpload = async (file: File, replaceId: string | null) => {
    const problem = videoUploadError(file);
    if (problem) { setError(problem); return; }
    setError(null);
    setUploading(true);
    try {
      const uploaded = await uploadSiteVideo(file);
      if (replaceId) {
        // playbackWarning has to be carried through a REPLACE too, or swapping a
        // bad clip for a good one would leave the old warning sitting on it (and
        // swapping a good one for a bad one would show none at all).
        patchVideo(replaceId, {
          url: uploaded.url,
          posterUrl: uploaded.posterUrl,
          duration: uploaded.duration,
          playbackWarning: uploaded.playbackWarning,
        });
      } else {
        setVideos([...content.videos, { ...blankVideo(), ...uploaded }]);
      }
    } catch (uploadFailure) {
      setError(uploadFailure instanceof Error ? uploadFailure.message : 'The upload didn’t finish. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const applyLink = (id: string | null) => {
    const url = linkDraft.trim();
    if (!isPlayableVideoUrl(url)) {
      setError('That isn’t a YouTube link we recognize. Paste the address from YouTube’s address bar or Share button.');
      return;
    }
    setError(null);
    // A pasted YouTube link carries no warning: YouTube transcodes for us, so
    // whatever the owner uploaded there already plays everywhere.
    if (id) patchVideo(id, { url, posterUrl: '', duration: 0, playbackWarning: '' });
    else setVideos([...content.videos, { ...blankVideo(), url }]);
    setLinkFor(null);
    setLinkDraft('');
  };

  if (!mounted) return null;

  const styleInfo = STYLE_FIELDS[content.style];

  return createPortal(
    <div className={styles.pickerOverlay} role="dialog" aria-modal="true" aria-label="Video section" onMouseDown={onClose}>
      <div className={`${styles.pickerModal} ${styles.videoStudio}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.pickerHead}>
          <div>
            <strong>Video section</strong>
            <small>Pick an arrangement — your videos and words move into it. Nothing you’ve written is lost when you switch.</small>
          </div>
          <button type="button" className={styles.pickerClose} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Style strip — the six arrangements, each drawn as the shape it makes. */}
        <div className={styles.vsStyleStrip} role="radiogroup" aria-label="Section style">
          {VIDEO_SECTION_STYLES.map((option) => (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={content.style === option.key}
              className={`${styles.vsStyleBtn}${content.style === option.key ? ` ${styles.vsStyleBtnOn}` : ''}`}
              onClick={() => onChange({ ...content, style: option.key })}
              title={option.desc}
            >
              <StyleGlyph style={option.key} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.vsBody}>
          {/* ── Preview ── */}
          <div className={styles.vsPreviewPane}>
            <div className={styles.vsPreviewHead}>
              <span>Live section preview</span>
              <div className={styles.vsDeviceToggle} role="group" aria-label="Preview width">
                <button type="button" className={device === 'desktop' ? styles.vsDeviceOn : undefined} onClick={() => setDevice('desktop')}>Desktop</button>
                <button type="button" className={device === 'mobile' ? styles.vsDeviceOn : undefined} onClick={() => setDevice('mobile')}>Mobile</button>
              </div>
            </div>
            <div className={`${styles.vsPreviewStage}${device === 'mobile' ? ` ${styles.vsPreviewMobile}` : ''}`}>
              <StylePreview content={content} videos={shown} />
            </div>
            <p className={styles.vsPreviewNote}>{styleInfo.bestFor}</p>
          </div>

          {/* ── Controls ── */}
          <div className={styles.vsControls}>
            <div className={styles.vsControlsHead}>
              <strong>Section content</strong>
              <small>Content stays intact when you switch layouts.</small>
            </div>

            {error && <p className={styles.vsError} role="alert">{error}</p>}

            <div className={styles.contentSubhead}>
              <strong>Video source</strong>
              <small>{shown.length === 0 ? 'none yet' : `${shown.length} of ${capacity} used`}</small>
            </div>

            {shown.map((item, index) => {
              const source = parseVideoSource(item.url);
              const poster = videoPoster(item);
              const duration = formatVideoDuration(item.duration);
              return (
                <div key={item.id} className={styles.vsVideoRow}>
                  <div className={styles.vsThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {poster ? <img src={poster} alt="" /> : <span aria-hidden="true">▶</span>}
                    {duration && <em>{duration}</em>}
                  </div>
                  <div className={styles.vsVideoMeta}>
                    <strong>
                      {!source ? 'Not playable yet' : source.kind === 'youtube' ? 'YouTube link' : 'Uploaded file'}
                      {capacity > 1 ? ` · ${index + 1}` : ''}
                    </strong>
                    <div className={styles.vsRowActions}>
                      <label className={styles.vsRowUpload}>
                        <input
                          type="file"
                          accept={VIDEO_FILE_ACCEPT}
                          disabled={uploading}
                          onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void handleUpload(file, item.id); }}
                        />
                        <span>{uploading ? 'Uploading…' : 'Replace'}</span>
                      </label>
                      <button type="button" onClick={() => { setLinkFor(linkFor === item.id ? null : item.id); setLinkDraft(source?.kind === 'youtube' ? item.url : ''); }}>Link</button>
                      <button type="button" className={styles.vsRowRemove} onClick={() => removeVideo(item)} aria-label="Remove this video">✕</button>
                    </div>
                    {linkFor === item.id && (
                      <div className={styles.vsLinkRow}>
                        <input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-label="YouTube link" />
                        <button type="button" onClick={() => applyLink(item.id)}>Use</button>
                      </div>
                    )}
                    {/* Sits on the clip it's about, not in the popup's error slot
                        at the top: with six clips in a reel, "one of these won't
                        play" is not an actionable sentence. It's a warning, not
                        an error — the clip publishes either way, because plenty
                        of these are genuinely fine for a given audience and a
                        false positive that blocked a working video would be the
                        worse failure. */}
                    {item.playbackWarning && (
                      <p className={styles.vsWarn}>
                        <strong>May not play for some visitors.</strong> {item.playbackWarning}
                      </p>
                    )}
                    {content.style === 'reel' && (
                      <input className={styles.vsInlineInput} value={item.label} maxLength={60} placeholder="Caption on the tile — e.g. Roof reveal" onChange={(event) => patchVideo(item.id, { label: event.target.value })} />
                    )}
                    {content.style === 'testimonial' && (
                      <>
                        <textarea className={styles.vsInlineInput} rows={2} value={item.quote} maxLength={400} placeholder="What they said, in their words." onChange={(event) => patchVideo(item.id, { quote: event.target.value })} />
                        <div className={styles.vsInlinePair}>
                          <input className={styles.vsInlineInput} value={item.author} maxLength={60} placeholder="Name" onChange={(event) => patchVideo(item.id, { author: event.target.value })} />
                          <input className={styles.vsInlineInput} value={item.authorLabel} maxLength={60} placeholder="Royal Oak homeowner" onChange={(event) => patchVideo(item.id, { authorLabel: event.target.value })} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {shown.length < capacity && (
              <div className={styles.vsAddRow}>
                <label className={styles.blogCoverUpload}>
                  <input
                    type="file"
                    accept={VIDEO_FILE_ACCEPT}
                    disabled={uploading}
                    onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void handleUpload(file, null); }}
                  />
                  <span>{uploading ? 'Uploading…' : '⬆ Upload a video'}</span>
                </label>
                <button type="button" className={styles.secondaryAction} onClick={() => { setLinkFor('new'); setLinkDraft(''); }}>Use a YouTube link</button>
              </div>
            )}
            {linkFor === 'new' && (
              <div className={styles.vsLinkRow}>
                <input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-label="YouTube link" autoFocus />
                <button type="button" onClick={() => applyLink(null)}>Add</button>
              </div>
            )}
            {shown.length === 0 && (
              <p className={styles.fieldHint}>Up to 50 MB — about 45 seconds of phone video. Vertical clips shot on a phone work well in the Reel gallery. Nothing shows on your site until a video is here.</p>
            )}
            {content.style === 'hero' && shown.some((item) => parseVideoSource(item.url)?.kind === 'youtube') && (
              <p className={styles.fieldHint}>
                Heads up: the Hero layout plays this behind your headline, and a YouTube link brings YouTube&apos;s title and logo with it for the first second or two. An uploaded file plays clean — worth doing for this layout specifically.
              </p>
            )}
            {parked > 0 && (
              <p className={styles.fieldHint}>
                {parked === 1 ? '1 more video is' : `${parked} more videos are`} saved but not shown — this layout uses {capacity === 1 ? 'one clip' : `${capacity}`}. Switch to Reel gallery or Testimonial to bring {parked === 1 ? 'it' : 'them'} back.
              </p>
            )}

            <label className={styles.formField}>
              <span>Headline</span>
              <input value={content.headline} maxLength={120} onChange={(event) => onChange({ ...content, headline: event.target.value })} placeholder="See what quality craftsmanship looks like." />
            </label>

            {content.style !== 'testimonial' && (
              <label className={styles.formField}>
                <span>Button label</span>
                <input value={content.ctaLabel} maxLength={40} onChange={(event) => onChange({ ...content, ctaLabel: event.target.value })} placeholder="Get a free estimate" />
                <small className={styles.fieldHint}>Leave blank for no button.</small>
              </label>
            )}

            <div className={styles.contentSubhead}><strong>Playback</strong></div>
            <label className={styles.vsSwitchRow}>
              <input type="checkbox" checked={content.autoplay} onChange={(event) => onChange({ ...content, autoplay: event.target.checked })} />
              <span>Autoplay muted<small>{content.style === 'reel' ? 'Reel tiles always wait for a tap — a row of self-starting videos burns a visitor’s data.' : 'Every browser blocks autoplay with sound, so a silent start is the only one that actually plays. Visitors get an unmute button.'}</small></span>
            </label>
            <label className={styles.vsSwitchRow}>
              <input type="checkbox" checked={content.loop} onChange={(event) => onChange({ ...content, loop: event.target.checked })} />
              <span>Loop video<small>Restarts when it ends.</small></span>
            </label>
            <label className={styles.vsSwitchRow}>
              <input type="checkbox" checked={content.controls} onChange={(event) => onChange({ ...content, controls: event.target.checked })} />
              <span>Show player controls<small>The scrub bar and volume. Off looks cleaner behind text; on is better for anything worth watching all the way through.</small></span>
            </label>

            <label className={styles.formField}>
              <span>Text overlay {content.overlay}%</span>
              <input
                className={styles.vsRange}
                type="range"
                min={0}
                max={90}
                step={5}
                value={content.overlay}
                onChange={(event) => onChange({ ...content, overlay: Number(event.target.value) })}
              />
              <small className={styles.fieldHint}>How much the video is dimmed behind your words. Only the Hero layout puts text over the video.</small>
            </label>

            <button type="button" className={styles.vsAdvancedToggle} aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
              {advanced ? '▾' : '▸'} Advanced
            </button>

            {advanced && (
              <div className={styles.vsAdvanced}>
                <label className={styles.formField}>
                  <span>Small line above the headline</span>
                  <input value={content.eyebrow} maxLength={40} onChange={(event) => onChange({ ...content, eyebrow: event.target.value })} placeholder="Meet the owner" />
                </label>
                <label className={styles.formField}>
                  <span>Description</span>
                  <textarea rows={3} value={content.body} maxLength={400} onChange={(event) => onChange({ ...content, body: event.target.value })} placeholder="A quick hello, what we believe, and what homeowners can expect." />
                </label>
                <label className={styles.formField}>
                  <span>Button link</span>
                  <input value={content.ctaHref} maxLength={200} onChange={(event) => onChange({ ...content, ctaHref: event.target.value })} placeholder="#contact" />
                  <small className={styles.fieldHint}>#contact sends them to your request form. A full https:// address works too.</small>
                </label>

                <div className={styles.contentSubhead}><strong>Project details</strong><small>shown by the Project story layout</small></div>
                <label className={styles.formField}><span>Location</span><input value={content.location} maxLength={60} onChange={(event) => onChange({ ...content, location: event.target.value })} placeholder="Royal Oak, MI" /></label>
                <div className={styles.formColumns}>
                  <label className={styles.formField}><span>Timeline</span><input value={content.timeline} maxLength={40} onChange={(event) => onChange({ ...content, timeline: event.target.value })} placeholder="2 days" /></label>
                  <label className={styles.formField}><span>Service</span><input value={content.service} maxLength={40} onChange={(event) => onChange({ ...content, service: event.target.value })} placeholder="Roofing" /></label>
                </div>

                <div className={styles.contentSubhead}><strong>Steps</strong><small>shown by the Process layout</small></div>
                {content.steps.slice(0, MAX_VIDEO_STEPS).map((step, index) => (
                  <label key={step.id} className={styles.formField}>
                    <span>Step {index + 1}</span>
                    <input
                      value={step.title}
                      maxLength={40}
                      placeholder={['Free estimate', 'Approve quote', 'We get to work', 'Final walkthrough'][index] || 'Step'}
                      onChange={(event) => onChange({ ...content, steps: content.steps.map((other) => (other.id === step.id ? { ...other, title: event.target.value } : other)) })}
                    />
                  </label>
                ))}

                <div className={styles.contentSubhead}><strong>On phones</strong></div>
                <label className={styles.vsSwitchRow}>
                  <input type="checkbox" checked={content.mobilePoster} onChange={(event) => onChange({ ...content, mobilePoster: event.target.checked })} />
                  <span>Show the still frame instead of autoplaying<small>Recommended. Most visitors arrive on a phone, often on cellular data — a video that starts itself spends their money before they’ve decided they want it.</small></span>
                </label>
              </div>
            )}

            <p className={styles.vsUses}><strong>This layout uses:</strong> {styleInfo.uses.join(' · ')}</p>

            <div className={styles.vsFooter}>
              <button type="button" className={styles.vsDone} onClick={onClose}>✓ Done</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// The little diagram on each style button — the shape that style makes, drawn
// in blocks. A name alone ("Process") doesn't tell you what you'd get.
// Exported so the logged-out demo draws the SAME six shapes and the same
// section preview as the real studio. A prospect comparing layouts is looking
// at the product; a hand-copied set of glyphs would be a picture of it, and
// would stop matching the first time a style changed.
export function StyleGlyph({ style }: { style: SiteVideoStyle }) {
  return (
    <span className={styles.vsGlyph} data-glyph={style} aria-hidden="true">
      {style === 'hero' && <><i className={styles.vsGlyphFill} /><i className={styles.vsGlyphBarWide} /></>}
      {style === 'split' && <><i className={styles.vsGlyphHalf} /><i className={styles.vsGlyphHalf} /></>}
      {style === 'story' && <><i className={styles.vsGlyphHalf} /><span><i className={styles.vsGlyphBar} /><i className={styles.vsGlyphBar} /></span></>}
      {style === 'reel' && <><i className={styles.vsGlyphTall} /><i className={styles.vsGlyphTall} /><i className={styles.vsGlyphTall} /></>}
      {style === 'testimonial' && <><i className={styles.vsGlyphHalf} /><i className={styles.vsGlyphHalf} /></>}
      {style === 'process' && <><i className={styles.vsGlyphBarWide} /><span><i className={styles.vsGlyphDash} /><i className={styles.vsGlyphDash} /><i className={styles.vsGlyphDash} /></span></>}
    </span>
  );
}

// A scale model of the section, using the owner's real words and real poster
// frames. Not the live site — the point is to compare arrangements at a glance,
// which a real player at real size can't do inside a dialog.
export function StylePreview({ content, videos }: { content: SiteVideoSectionContent; videos: SiteVideoItem[] }) {
  const primary = videos[0];
  const media = (item: SiteVideoItem | undefined, className: string, label?: string) => {
    const poster = item ? videoPoster(item) : '';
    // An empty slot is drawn faintly so it reads as "room for another clip"
    // rather than as a video that failed to load.
    return (
      <span className={`${styles.vsShot} ${className}${item ? '' : ` ${styles.vsShotEmpty}`}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {poster && <img src={poster} alt="" />}
        <i className={styles.vsShotPlay} aria-hidden="true" />
        {label && <em>{label}</em>}
        {item?.duration ? <b>{formatVideoDuration(item.duration)}</b> : null}
      </span>
    );
  };

  if (content.style === 'hero') {
    return (
      <div className={styles.vsHeroPreview} style={{ '--vs-scrim': String(content.overlay / 100) } as CSSProperties}>
        {media(primary, styles.vsShotFill)}
        <div className={styles.vsHeroCopy}>
          {content.eyebrow && <span className={styles.vsEyebrow}>{content.eyebrow}</span>}
          <strong>{content.headline || 'Your headline'}</strong>
          {content.body && <p>{content.body}</p>}
          {content.ctaLabel && <span className={styles.vsBtn}>{content.ctaLabel}</span>}
        </div>
      </div>
    );
  }

  if (content.style === 'reel') {
    return (
      <div className={styles.vsPreviewBlock}>
        {content.eyebrow && <span className={styles.vsEyebrow}>{content.eyebrow}</span>}
        <strong className={styles.vsHeading}>{content.headline || 'Your headline'}</strong>
        <div className={styles.vsReelRow}>
          {/* Always show three cells: one real clip in an empty row reads as
              "this layout shows one video", which is the opposite of the truth. */}
          {[videos[0], videos[1], videos[2]].map((item, index) => (
            <span key={item?.id ?? `blank-${index}`} className={styles.vsReelCell}>
              {media(item, styles.vsShotTall, item?.label)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (content.style === 'process') {
    return (
      <div className={styles.vsPreviewBlock}>
        {content.eyebrow && <span className={styles.vsEyebrow}>{content.eyebrow}</span>}
        <strong className={styles.vsHeading}>{content.headline || 'Your headline'}</strong>
        {media(primary, styles.vsShotWide, primary?.label)}
        <div className={styles.vsStepsRow}>
          {content.steps.filter((step) => step.title.trim()).slice(0, MAX_VIDEO_STEPS).map((step, index) => (
            <span key={step.id}><em>{String(index + 1).padStart(2, '0')}</em>{step.title}</span>
          ))}
        </div>
      </div>
    );
  }

  if (content.style === 'testimonial') {
    return (
      <div className={styles.vsSplitPreview}>
        {media(primary, styles.vsShotHalf, primary?.label || 'Customer story')}
        <div className={styles.vsPreviewCopy}>
          <span className={styles.vsQuoteMark} aria-hidden="true">&rdquo;</span>
          <strong>{content.headline || 'Your headline'}</strong>
          {primary?.quote && <p>&ldquo;{primary.quote}&rdquo;</p>}
          {(primary?.author || primary?.authorLabel) && (
            <p className={styles.vsPreviewAuthor}><b>{primary?.author || 'Homeowner'}</b>{primary?.authorLabel && <span>{primary.authorLabel}</span>}</p>
          )}
        </div>
      </div>
    );
  }

  if (content.style === 'story') {
    return (
      <div className={styles.vsSplitPreview}>
        {media(primary, styles.vsShotHalf, primary?.label || 'Watch project')}
        <div className={styles.vsPreviewCopy}>
          {content.location && <span className={styles.vsEyebrow}>{content.location}</span>}
          <strong>{content.headline || 'Your headline'}</strong>
          {(content.timeline || content.service) && (
            <div className={styles.vsFactsRow}>
              {content.timeline && <span><b>{content.timeline}</b>Timeline</span>}
              {content.service && <span><b>{content.service}</b>Service</span>}
            </div>
          )}
          {content.ctaLabel && <span className={styles.vsBtn}>{content.ctaLabel}</span>}
        </div>
      </div>
    );
  }

  // split
  return (
    <div className={styles.vsSplitPreview}>
      {media(primary, styles.vsShotHalf, primary?.label)}
      <div className={styles.vsPreviewCopy}>
        {content.eyebrow && <span className={styles.vsEyebrow}>{content.eyebrow}</span>}
        <strong>{content.headline || 'Your headline'}</strong>
        {content.body && <p>{content.body}</p>}
        {content.ctaLabel && <span className={styles.vsBtn}>{content.ctaLabel}</span>}
      </div>
    </div>
  );
}
