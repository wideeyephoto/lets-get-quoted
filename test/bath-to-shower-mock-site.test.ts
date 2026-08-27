import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mockSite = readFileSync('src/app/demo/reel/mock-site/page.tsx', 'utf8');
const reel = readFileSync('src/components/demo/BathToShowerReel.tsx', 'utf8');
const reelStyles = readFileSync('src/components/demo/bath-to-shower-reel.module.css', 'utf8');

describe('bath-to-shower mock product site', () => {
  it('embeds the live reel inside a contractor-focused product landing page', () => {
    expect(mockSite).toContain("LET&apos;S GET QUOTED");
    expect(mockSite).toContain('<BathToShowerReel variant="embed" autoplay={false} />');
    expect(mockSite).toContain('Show the job. Send the price. Book the work.');
    expect(mockSite).toContain('Your next quote can look this clear.');
  });

  it('preserves the reel design scale in an inline aspect-ratio container', () => {
    expect(reel).toContain("variant?: 'standalone' | 'embed'");
    expect(reel).toContain('root.clientWidth / 720');
    expect(reelStyles).toContain('aspect-ratio: 9 / 16');
    expect(reelStyles).toContain('transform-origin: top left');
  });

  it('uses the matched before and after project imagery', () => {
    expect(mockSite).toContain('/demo/bath-to-shower/before.png');
    expect(mockSite).toContain('/demo/bath-to-shower/after.png');
  });

  it('uses playback controls and removes fake focusable scene actions', () => {
    expect(reel).toContain("{isPlaying ? 'Pause'");
    expect(reel).toContain('IntersectionObserver');
    expect(reel).not.toContain('<button className={styles.sendButton}');
    expect(reel).not.toContain('<button className={styles.approveButton}');
  });
});
