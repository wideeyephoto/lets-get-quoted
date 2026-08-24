'use client';

import { useState } from 'react';

export default function ProcessingVolumeRoiCalculator({
  planName,
  platformFeeBps,
}: {
  planName: string;
  platformFeeBps: number;
}) {
  const [volume, setVolume] = useState(10000);
  const flexFee = (volume * 125) / 10000;
  const currentFee = (volume * platformFeeBps) / 10000;
  const savingsVsFlex = flexFee - currentFee;

  return (
    <div className="plan-usage-roi-callout interactive">
      <div className="plan-roi-top-row">
        <div className="plan-roi-header">
          <svg viewBox="0 0 24 24" className="plan-usage-roi-ic" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
          <div className="plan-usage-roi-text">
            <strong>{planName} saves you ${((125 - platformFeeBps) / 10).toFixed(2)} per $1,000 processed vs Flex (1.25%)</strong>
            <span>At ${volume.toLocaleString('en-US')}/mo volume, your {(platformFeeBps / 100).toFixed(2)}% fee saves ${savingsVsFlex.toFixed(2)}/mo in platform processing fees.</span>
          </div>
        </div>
        <span className="plan-roi-volume-chip">${volume.toLocaleString('en-US')}/mo</span>
      </div>
      <div className="plan-roi-slider-container">
        <input
          type="range"
          min={1000}
          max={50000}
          step={1000}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="plan-roi-slider"
          aria-label="Monthly card processing volume"
        />
        <div className="plan-roi-slider-labels">
          <span>$1k/mo</span>
          <span>$10k/mo</span>
          <span>$25k/mo</span>
          <span>$50k/mo</span>
        </div>
      </div>
    </div>
  );
}
