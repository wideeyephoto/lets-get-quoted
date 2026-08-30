import React from 'react';
import Image from 'next/image';
import styles from './SparkyAvatar.module.css';

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

const TRADE_AVATAR_SRC: Record<string, string> = {
  electrician: '/brand/sparky/sparky-electrician.jpg',
  electrical: '/brand/sparky/sparky-electrician.jpg',
  carpentry: '/brand/sparky/sparky-carpenter.jpg',
  carpenter: '/brand/sparky/sparky-carpenter.jpg',
  framing: '/brand/sparky/sparky-carpenter.jpg',
  framer: '/brand/sparky/sparky-carpenter.jpg',
  inspector: '/brand/sparky/sparky-inspector.jpg',
  safety: '/brand/sparky/sparky-inspector.jpg',
  hvac: '/brand/sparky/sparky-inspector.jpg',
  general: '/brand/sparky/sparky-inspector.jpg',
  lawncare: '/brand/sparky/sparky-lawncare.jpg',
  'lawn-care': '/brand/sparky/sparky-lawncare.jpg',
  landscaping: '/brand/sparky/sparky-lawncare.jpg',
  landscape: '/brand/sparky/sparky-lawncare.jpg',
  mowing: '/brand/sparky/sparky-lawncare.jpg',
  grounds: '/brand/sparky/sparky-lawncare.jpg',
  plumbing: '/brand/sparky/sparky-plumber.jpg',
  plumber: '/brand/sparky/sparky-plumber.jpg',
  pipefitter: '/brand/sparky/sparky-plumber.jpg',
  roofing: '/brand/sparky/sparky-roofer.jpg',
  roofer: '/brand/sparky/sparky-roofer.jpg',
  masonry: '/brand/sparky/sparky-roofer.jpg',
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
  expression = 'avatar',
  trade = 'general',
  size = 'md',
  status = 'none',
  showSparkle = false,
  className = '',
  alt = 'Copilot - Contractor AI Sidekick',
  priority = false,
  bordered = true,
}: SparkyAvatarProps) {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || 36;
  
  let imageSrc = customSrc || EXPRESSION_SRC[expression] || EXPRESSION_SRC.avatar;

  if (companionId && companionId !== 'sparky') {
    const companion = getCompanion(companionId);
    imageSrc = companion.avatarSrc;
  } else {
    // If trade avatar is available and expression is default avatar, use trade gear
    const tradeKey = (trade || '').toLowerCase();
    if (expression === 'avatar' && TRADE_AVATAR_SRC[tradeKey]) {
      imageSrc = TRADE_AVATAR_SRC[tradeKey];
    }
  }

  const activeCompanion = getCompanion(companionId, trade);
  const companionName = activeCompanion?.name || 'AI Copilot';

  return (
    <div
      className={`${styles.container} ${bordered ? styles.bordered : ''} ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
      role="img"
      aria-label={alt || `${companionName} - Contractor AI Sidekick`}
    >
      <div className={styles.imageWrapper}>
        <Image
          src={imageSrc}
          alt={alt || `${companionName} avatar`}
          width={pixelSize * 2} // 2x for sharp retina rendering
          height={pixelSize * 2}
          priority={priority}
          className={styles.image}
          unoptimized
        />
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
