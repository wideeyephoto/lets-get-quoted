import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mockSite = readFileSync('src/app/demo/reel/mock-site/page.tsx', 'utf8');
const reel = readFileSync('src/components/demo/BathToShowerReel.tsx', 'utf8');
const reelStyles = readFileSync('src/components/demo/bath-to-shower-reel.module.css', 'utf8');
const intakeSlideshow = readFileSync('src/components/demo/AiIntakeSlideshow.tsx', 'utf8');

describe('bath-to-shower mock product site', () => {
  it('embeds the AI intake slideshow inside a contractor-focused product landing page', () => {
    expect(mockSite).toContain("LET&apos;S GET QUOTED");
    expect(mockSite).toContain('<AiIntakeSlideshow autoStart />');
    expect(mockSite).toContain('Let AI impress. You build the relationship.');
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

  it('uses the homeowner photo sequence with live capture coaching', () => {
    expect(existsSync('public/demo/bath-to-shower/homeowner-tub-photo-v1.png')).toBe(true);
    expect(existsSync('public/demo/bath-to-shower/homeowner-threshold-detail-v1.png')).toBe(true);
    expect(intakeSlideshow).toContain('/demo/bath-to-shower/homeowner-tub-photo-v1.png');
    expect(intakeSlideshow).toContain('/demo/bath-to-shower/homeowner-threshold-detail-v1.png');
    expect(intakeSlideshow).toContain('CAMERA READY · ANALYZING LIVE');
    expect(intakeSlideshow).toContain('Show the tub edge and floor transition.');
    expect(intakeSlideshow).toContain('Captured and understood');
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

  it('opens on the homeowner photo story and keeps booking as the finale', () => {
    const sequence = intakeSlideshow.slice(intakeSlideshow.indexOf('const slides = ['));

    expect(sequence.indexOf('MediaSlide')).toBeLessThan(sequence.indexOf('PhotoCoachSlide'));
    expect(sequence.indexOf('PhotoCoachSlide')).toBeLessThan(sequence.indexOf('VisionSlide'));
    expect(sequence.indexOf('RankingSlide')).toBeLessThan(sequence.indexOf('VoiceSlide'));
    expect(sequence.indexOf('VoiceSlide')).toBeLessThan(sequence.indexOf('PresetSlide'));
    expect(sequence.indexOf('PresetSlide')).toBeLessThan(sequence.indexOf('BookingSlide'));
  });
});
