'use client';

import React from 'react';
import styles from './ai.module.css';

export type AiChipOption = {
  id: string;
  label: string;
  actionValue?: string;
  icon?: React.ReactNode;
};

export type AiRefineChipsProps = {
  options: readonly (AiChipOption | string)[];
  onSelect: (option: AiChipOption | string) => void;
  selectedId?: string | null;
  className?: string;
};

export function AiRefineChips({
  options,
  onSelect,
  selectedId = null,
  className = '',
}: AiRefineChipsProps) {
  if (!options || options.length === 0) return null;

  return (
    <div className={`${styles.refineRail} ${className}`} role="group" aria-label="AI suggestions and refinements">
      {options.map((option, idx) => {
        const id = typeof option === 'string' ? `opt-${idx}` : option.id;
        const label = typeof option === 'string' ? option : option.label;
        const isSelected = selectedId === id;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(option)}
            className={`${styles.refineChip} ${isSelected ? styles.refineChipSelected : ''}`}
            aria-pressed={isSelected}
          >
            {typeof option !== 'string' && option.icon ? (
              <span aria-hidden="true">{option.icon}</span>
            ) : (
              <span className={styles.sparkleIcon} style={{ fontSize: '0.85em' }} aria-hidden="true">✦</span>
            )}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
