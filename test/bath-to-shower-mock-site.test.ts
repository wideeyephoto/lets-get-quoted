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

  it('uses swipe, keyboard, and progress navigation without visible playback controls', () => {
    expect(intakeSlideshow).toContain('onPointerDown');
    expect(intakeSlideshow).toContain('onPointerMove');
    expect(intakeSlideshow).toContain('onPointerUp');
    expect(intakeSlideshow).toContain('Go to slide');
    expect(intakeSlideshow).toContain("event.key === 'ArrowRight'");
    expect(intakeSlideshow).toContain('aria-label="Previous slide"');
    expect(intakeSlideshow).toContain('aria-label="Next slide"');
    expect(intakeSlideshow).not.toContain('>SWIPE ');
    expect(intakeSlideshow).not.toContain('Play slideshow');
    expect(reel).not.toContain('<button className={styles.sendButton}');
    expect(reel).not.toContain('<button className={styles.approveButton}');
  });

  it('covers the complete AI intake story in eight slides', () => {
    expect(intakeSlideshow).toContain('AI PHONE');
    expect(intakeSlideshow).toContain('JOB INTELLIGENCE');
    expect(intakeSlideshow).toContain('ADAPTIVE QUESTIONS');
    expect(intakeSlideshow).toContain('AI QUOTE DRAFT');
    expect(intakeSlideshow).toContain('CONTRACTOR REVIEW');
    expect(intakeSlideshow).toContain('GUARDED BALLPARK');
    expect(intakeSlideshow).toContain('BOOKING HANDOFF');
    expect((intakeSlideshow.match(/function \w+Slide\(/g) ?? [])).toHaveLength(8);
    expect(mockSite).toContain('Watch the 34-sec journey');
    expect(mockSite).toContain('Replay all 8 slides');
  });

  it('opens on the homeowner photo story and keeps booking as the finale', () => {
    const sequence = intakeSlideshow.slice(intakeSlideshow.indexOf('const slides = ['));

    expect(sequence.indexOf('MediaSlide')).toBeLessThan(sequence.indexOf('PhotoCoachSlide'));
    expect(sequence.indexOf('PhotoCoachSlide')).toBeLessThan(sequence.indexOf('VisionSlide'));
    expect(sequence.indexOf('VisionSlide')).toBeLessThan(sequence.indexOf('QuestionsSlide'));
    expect(sequence.indexOf('QuestionsSlide')).toBeLessThan(sequence.indexOf('QuoteDraftSlide'));
    expect(sequence.indexOf('QuoteDraftSlide')).toBeLessThan(sequence.indexOf('ReviewSlide'));
    expect(sequence.indexOf('ReviewSlide')).toBeLessThan(sequence.indexOf('TrustTransferSlide'));
    expect(sequence.indexOf('TrustTransferSlide')).toBeLessThan(sequence.indexOf('BookingSlide'));
  });

  it('shows intake details filling a sourced quote before contractor approval', () => {
    expect(intakeSlideshow).toContain('Build the first draft in one click.');
    expect(intakeSlideshow).toContain('60&quot; alcove conversion');
    expect(intakeSlideshow).toContain('Low-threshold shower base');
    expect(intakeSlideshow).toContain('PRICE BOOK');
    expect(intakeSlideshow).toContain('PAST JOBS');
    expect(intakeSlideshow).toContain('SUPPLIER REF');
    expect(intakeSlideshow).toContain('Draft total <b>$8,420</b>');
    expect(intakeSlideshow).toContain('Nothing goes out without you.');
    expect(intakeSlideshow).toContain('2 prices need review');
    expect(intakeSlideshow).not.toContain('LIVE HOME DEPOT');
  });
});
