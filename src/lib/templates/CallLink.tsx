'use client';

import React, { ReactNode } from 'react';
import { trackQuoteFunnelStep } from '@/lib/analytics';
import type { Site } from '@/lib/sites';

export default function CallLink({
  site,
  className,
  children,
  onClick,
  ...props
}: {
  site: { phone?: string | null; template: string };
  className?: string;
  children: ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const phone = site.phone;
  if (!phone) return null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackQuoteFunnelStep({
      step: 'call_intent',
      formStyle: 'phone',
      template: site.template,
      device: typeof window !== 'undefined' && window.innerWidth <= 768 ? 'mobile' : 'desktop',
    });
    if (onClick) onClick(e);
  };

  return (
    <a href={`tel:${phone}`} className={className} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
