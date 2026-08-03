'use client';

import { useState, type CSSProperties } from 'react';
import type { Site } from '@/lib/sites';
import type { SiteVideoItem, SiteVideoSectionContent } from '@/lib/site-content';
import { formatVideoDuration, parseVideoSource, videoPoster } from '@/lib/video-source';
import { youTubeEmbedSrc } from '@/lib/youtube';
import styles from './themes.module.css';

// Standalone /videos index — every clip on the site in one grid. Like the blog
// index it renders outside the template shell, so it carries its own shell and
// the site's accent.
//
// Nothing plays until it is asked to. A homepage band autoplays one muted clip
// as decoration; a page of twelve doing that would be a page that downloads
// twelve videos to show twelve still frames. So each tile is a poster until it
// is clicked, and then it is the only thing playing.

type Entry = { item: SiteVideoItem; section: SiteVideoSectionContent };

export default function SiteVideoIndex({
  site,
  title,
  intro,
  entries,
}: {
  site: Site;
  title: string;
  intro: string;
  entries: Entry[];
}) {
  const themeStyle = { '--theme-accent': site.accent_override || '#2563eb' } as CSSProperties;
  // One at a time, by id — starting a second clip stops the first, which is
  // what anyone expects from a gallery and what stops four soundtracks at once.
  const [playing, setPlaying] = useState<string | null>(null);

  return (
    <main className={styles.blogArticleShell} style={themeStyle}>
      <div className={styles.blogIndex}>
        <a className={styles.blogBack} href="/">{site.company_name || 'Home'}</a>
        <header className={styles.blogIndexHead}>
          <p className={styles.blogIndexKicker}>Videos</p>
          <h1>{title}</h1>
          {intro && <p className={styles.blogIndexIntro}>{intro}</p>}
        </header>

        <div className={styles.blogGrid}>
          {entries.map(({ item, section }) => {
            const source = parseVideoSource(item.url);
            if (!source) return null;
            const poster = videoPoster(item);
            const duration = formatVideoDuration(item.duration);
            const isPlaying = playing === item.id;
            // The band's own headline is the closest thing each clip has to a
            // caption when the owner never labelled the item itself.
            const caption = item.label.trim() || section.headline.trim();

            return (
              <figure key={item.id} className={styles.blogCard}>
                <div className={styles.videoIndexFrame}>
                  {isPlaying ? (
                    source.kind === 'youtube' ? (
                      <iframe
                        src={youTubeEmbedSrc(source.video, { autoplay: true, controls: true })}
                        title={caption || 'Video'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        loading="lazy"
                      />
                    ) : (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={source.url} poster={poster || undefined} controls autoPlay playsInline />
                    )
                  ) : (
                    <button type="button" className={styles.videoIndexPlay} onClick={() => setPlaying(item.id)}>
                      {poster
                        ? <img src={poster} alt="" loading="lazy" decoding="async" />
                        : <span className={styles.videoIndexBlank} aria-hidden="true" />}
                      <span className={styles.videoIndexPlayMark} aria-hidden="true">▶</span>
                      {duration && <span className={styles.videoIndexTime}>{duration}</span>}
                      <span className="sr-only">Play{caption ? ` — ${caption}` : ''}</span>
                    </button>
                  )}
                </div>
                {(caption || item.quote) && (
                  <figcaption className={styles.blogCardBody}>
                    {caption && <h3>{caption}</h3>}
                    {item.quote && <p>&ldquo;{item.quote}&rdquo;{item.author ? ` — ${item.author}` : ''}</p>}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      </div>
    </main>
  );
}
