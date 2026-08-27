'use client';

import AiIntakeSlideshow from '@/components/demo/AiIntakeSlideshow';

/**
 * Homepage hero product surface.
 *
 * The surrounding homepage owns the headline, CTAs, decorative treatment, and
 * proof strip. This component only replaces the previous screenshot carousel
 * with the interactive AI-intake story.
 */
export default function HeroAiIntakeShowcase() {
  return (
    <div className="hero-showcase">
      <AiIntakeSlideshow autoStart />
    </div>
  );
}
