import React from 'react';
import Image from 'next/image';
import styles from './SparkyAvatar.module.css';
import MiniFusionReactor from './MiniFusionReactor';

import { getCompanion } from '@/lib/ai-assistant/companions';

export type SparkyExpression = 'avatar' | 'thinking' | 'success' | 'action';
export type SparkyTrade =
  | 'general'
  | 'electrician'
  | 'plumbing'
  | 'carpentry'
  | 'roofing'
  | 'painting'
  | 'inspector'
  | 'hvac'
  | 'landscaping'
  | 'lawncare';

export type SparkySize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;
export type SparkyStatus = 'online' | 'thinking' | 'idle' | 'none';

interface SparkyAvatarProps {
  companionId?: string;
  customSrc?: string;
  expression?: SparkyExpression;
  trade?: SparkyTrade | string;
  size?: SparkySize;
  status?: SparkyStatus;
  showSparkle?: boolean;
  className?: string;
  alt?: string;
  priority?: boolean;
  bordered?: boolean;
}

const EXPRESSION_SRC: Record<SparkyExpression, string> = {
  avatar: '/brand/sparky/sparky-avatar.jpg',
  thinking: '/brand/sparky/sparky-thinking.jpg',
  success: '/brand/sparky/sparky-success.jpg',
  action: '/brand/sparky/sparky-action.jpg',
};

const SIZE_MAP: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl', number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
  '2xl': 96,
};

export default function SparkyAvatar({
  companionId,
  customSrc,
  expression: _expression = 'avatar',
  trade = 'general',
  size = 'md',
  status = 'none',
  showSparkle = false,
  className = '',
  alt = 'AI Assistant - Contractor AI Sidekick',
  priority = false,
  bordered = true,
}: SparkyAvatarProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || 36;
  
  const activeCompanion = getCompanion(companionId, trade);
  const companionName = activeCompanion?.name || 'AI Assistant';
  const imageSrc = customSrc || activeCompanion.avatarSrc || EXPRESSION_SRC.avatar;

  const isReactor =
    !companionId ||
    companionId === 'assistant' ||
    companionId === 'sparky' ||
    companionId === 'nova' ||
    activeCompanion.id === 'assistant' ||
    customSrc === 'reactor' ||
    imageSrc?.includes('spark.jpg') ||
    imageSrc?.includes('energy-spark') ||
    imageSrc?.includes('beacon.png');

  return (
    <div
      className={`${styles.container} ${bordered ? styles.bordered : ''} ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
      role="img"
      aria-label={alt || `${companionName} - Contractor AI Sidekick`}
    >
      <div className={styles.imageWrapper}>
        {isReactor ? (
          <MiniFusionReactor
            size={pixelSize}
            isThinking={status === 'thinking'}
            alt={alt || `${companionName} - Mini Fusion Reactor`}
          />
        ) : (
          <Image
            src={imageSrc}
            alt={alt || `${companionName} avatar`}
            width={pixelSize * 2} // 2x for sharp retina rendering
            height={pixelSize * 2}
            priority={priority}
            className={styles.image}
            unoptimized
          />
        )}
      </div>

      {/* Online / Thinking Live Status Indicator */}
      {status === 'online' && (
        <span
          className={`${styles.statusDot} ${styles.statusOnline}`}
          title={`${companionName} is online`}
        />
      )}
      {status === 'thinking' && (
        <span
          className={`${styles.statusDot} ${styles.statusThinking}`}
          title={`${companionName} is calculating...`}
        />
      )}

      {/* Lightning Badge Overlay */}
      {showSparkle && (
        <span className={styles.sparkleBadge} aria-hidden="true">
          ⚡
        </span>
      )}
    </div>
  );
}
