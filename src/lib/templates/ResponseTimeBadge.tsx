import React from 'react';

export function formatReplyTime(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minutes`;
  const hrs = Math.round(mins / 60);
  if (hrs === 1) return 'about an hour';
  return `about ${hrs} hours`;
}

export default function ResponseTimeBadge({ site, className }: { site: { avg_response_ms?: number | null }; className?: string }) {
  if (typeof site.avg_response_ms !== 'number' || site.avg_response_ms <= 0) return null;
  return (
    <span className={className}>
      <span aria-hidden="true">⚡</span> Typically replies within {formatReplyTime(site.avg_response_ms)}
    </span>
  );
}
