'use client';

import { useState } from 'react';
import { DEFAULT_INTRO_VIDEO_TITLE, type SiteIntroVideoContent } from '@/lib/site-content';
import { parseYouTubeUrl, youTubeThumbnail } from '@/lib/youtube';
import { parseVideoSource, videoPoster, formatVideoDuration, VIDEO_FILE_ACCEPT } from '@/lib/video-source';
import { uploadSiteVideo, videoUploadError } from './video-upload';
import styles from './SiteEditor.module.css';

// Setup for the thank-you / intro video that plays after a lead submits.
// Supports direct uploads from phones/computers as well as YouTube links.
export default function IntroVideoField({
  video,
  onChange,
}: {
  video: SiteIntroVideoContent;
  onChange: (next: SiteIntroVideoContent) => void;
}) {
  const source = parseVideoSource(video.url);
  const isYouTube = source?.kind === 'youtube' || Boolean(parseYouTubeUrl(video.url));
  const isFile = source?.kind === 'file' || (!isYouTube && Boolean(video.url.trim()));

  // Active source mode tab in the builder ('upload' | 'youtube')
  const [mode, setMode] = useState<'upload' | 'youtube'>(() => (isYouTube ? 'youtube' : 'upload'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    const problem = videoUploadError(file, 'band');
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadSiteVideo(file, 'band');
      onChange({
        ...video,
        enabled: true,
        url: uploaded.url,
        posterUrl: uploaded.posterUrl,
        duration: uploaded.duration,
        playbackWarning: uploaded.playbackWarning,
      });
      setMode('upload');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The upload didn’t finish. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = () => {
    setError(null);
    onChange({
      ...video,
      url: '',
      posterUrl: '',
      duration: 0,
      playbackWarning: '',
    });
  };

  const poster = videoPoster({ url: video.url, posterUrl: video.posterUrl || '' });
  const parsedYouTube = parseYouTubeUrl(video.url.trim());

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
            It appears underneath their estimate on the &quot;request sent&quot; thank-you screen — welcoming them and building rapport.
          </small>
        </span>
      </label>

      {video.enabled && (
        <div className={styles.introVideoWrap}>
          <div className={styles.segmented} role="group" aria-label="Video source">
            <button
              type="button"
              className={mode === 'upload' ? styles.activeSegment : ''}
              onClick={() => { setMode('upload'); setError(null); }}
            >
              📱 Direct upload (Phone / File)
            </button>
            <button
              type="button"
              className={mode === 'youtube' ? styles.activeSegment : ''}
              onClick={() => { setMode('youtube'); setError(null); }}
            >
              🔴 YouTube link
            </button>
          </div>

          {mode === 'upload' ? (
            <div className={styles.introVideoUploadBlock}>
              {isFile && video.url.trim() ? (
                <div className={styles.introVideoFileCard}>
                  <div className={styles.introVideoThumbWrap}>
                    {poster ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={poster} alt="" className={styles.introVideoThumb} />
                    ) : (
                      <div className={styles.introVideoNoThumb}>🎬 Video uploaded</div>
                    )}
                    {video.duration ? (
                      <span className={styles.introVideoDurationBadge}>
                        {formatVideoDuration(video.duration)}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.introVideoMeta}>
                    <strong>Direct video ready</strong>
                    <small>Uploaded from your device and plays natively after customer submissions.</small>
                    <div className={styles.introVideoActions}>
                      <label className={styles.secondaryAction} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                        <input
                          type="file"
                          accept={VIDEO_FILE_ACCEPT}
                          disabled={busy}
                          style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.currentTarget.value = '';
                            if (file) void handleUpload(file);
                          }}
                        />
                        {busy ? 'Uploading…' : 'Replace video'}
                      </label>
                      <button type="button" className={styles.secondaryAction} onClick={handleRemove} disabled={busy}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.introVideoDropzone}>
                  <label className={styles.uploadButton} style={{ cursor: busy ? 'default' : 'pointer' }}>
                    <input
                      type="file"
                      accept={VIDEO_FILE_ACCEPT}
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.currentTarget.value = '';
                        if (file) void handleUpload(file);
                      }}
                    />
                    {busy ? 'Uploading from device…' : '📱 Choose video from phone / computer'}
                  </label>
                  <small className={styles.fieldHint}>
                    Upload an MP4 or MOV clip (up to 50 MB, ~45–60 seconds). Great for a quick &ldquo;Thanks for reaching out!&rdquo; selfie video.
                  </small>
                </div>
              )}
              {video.playbackWarning && (
                <p className={styles.warnNotice}>
                  <strong>Playback notice:</strong> {video.playbackWarning}
                </p>
              )}
            </div>
          ) : (
            <label className={styles.formField}>
              <span>YouTube link</span>
              <input
                type="url"
                inputMode="url"
                maxLength={300}
                value={video.url}
                onChange={(event) => onChange({ ...video, url: event.target.value, posterUrl: '', duration: 0, playbackWarning: '' })}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <small>
                {!video.url.trim()
                  ? 'Paste the link from YouTube — the address bar, the Share button, or a Shorts link all work.'
                  : parsedYouTube
                    ? 'Video found. It starts muted with a tap-for-sound control on the thank-you screen.'
                    : 'That doesn’t look like a YouTube link. Paste a valid link or switch to Direct Upload.'}
              </small>
              {parsedYouTube && (
                <div className={styles.introVideoPreview}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={youTubeThumbnail(parsedYouTube)} alt="" />
                  <div>
                    <strong>{video.title.trim() || DEFAULT_INTRO_VIDEO_TITLE}</strong>
                    <small>YouTube preview thumbnail</small>
                  </div>
                </div>
              )}
            </label>
          )}

          {error && <p className={styles.errorNotice} role="alert">{error}</p>}

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
        </div>
      )}
    </>
  );
}
