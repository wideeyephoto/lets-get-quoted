'use client';

import React, { ReactNode } from 'react';
import { trackQuoteFunnelStep } from '@/lib/analytics';
import type { Site } from '@/lib/sites';
import { getPublishedChatButton } from '@/lib/site-content';

export default function TextLink({
  site,
  className,
  children,
  onClick,
  ...props
}: {
  site: Site;
  className?: string;
  children?: ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  // If the owner hasn't enabled the messaging channel, don't show the button.
  // This ensures we respect their choice of communication.
  const chat = getPublishedChatButton(site.content, site.phone, site.company_name);
  if (!chat) return null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackQuoteFunnelStep({
      step: 'text_intent' as any,
      formStyle: chat.channel, // sms or whatsapp
      template: site.template,
      device: typeof window !== 'undefined' && window.innerWidth <= 768 ? 'mobile' : 'desktop',
    });
    if (onClick) onClick(e);
  };

  return (
    <a
      href={chat.href}
      className={className}
      onClick={handleClick}
      {...(chat.channel === 'whatsapp' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...props}
    >
      {children || chat.label}
    </a>
  );
}
