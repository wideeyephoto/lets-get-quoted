import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mockSite = readFileSync('src/app/demo/reel/mock-site/page.tsx', 'utf8');
const reel = readFileSync('src/components/demo/BathToShowerReel.tsx', 'utf8');
const reelStyles = readFileSync('src/components/demo/bath-to-shower-reel.module.css', 'utf8');
const intakeSlideshow = readFileSync('src/components/demo/AiIntakeSlideshow.tsx', 'utf8');

describe('bath-to-shower mock product site', () => {
  it('embeds the AI intake slideshow inside a contractor-focused product landing page', () => {
    expect(mockSite).toContain("LET&apos;S GET QUOTED");
    expect(mockSite).toContain('<AiIntakeSlideshow />');
    expect(mockSite).toContain('Make the first impression. Hand off the trust.');
    expect(mockSite).toContain('Let the technology impress. Let the contractor connect.');
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

  it('covers the complete AI intake story in ten slides', () => {
    expect(intakeSlideshow).toContain('General Contracting preset loaded');
    expect(intakeSlideshow).toContain('AI phone line');
    expect(intakeSlideshow).toContain('MULTIMODAL VISION');
    expect(intakeSlideshow).toContain('ADAPTIVE QUESTIONS');
    expect(intakeSlideshow).toContain('LEAD INTELLIGENCE');
    expect(intakeSlideshow).toContain('THE TRUST TRANSFER');
    expect(intakeSlideshow).toContain('PREMIUM LEAD SIGNALS');
    expect(intakeSlideshow).toContain('+15–20%');
    expect(intakeSlideshow).toContain('BCG–Altagamma, 2024');
    expect(intakeSlideshow).toContain('BOOKING HANDOFF');
    expect((intakeSlideshow.match(/function \w+Slide\(/g) ?? [])).toHaveLength(10);
  });
});
