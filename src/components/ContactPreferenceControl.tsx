'use client';

export type ContactPreferenceValue = 'any' | 'text';

export type ContactPreferenceControlProps = {
  companyName?: string | null;
  value: ContactPreferenceValue | null;
  onChange: (value: ContactPreferenceValue) => void;
  className?: string;
  labelClassName?: string;
  rowClassName?: string;
  chipClassName?: string;
};

export const CONTACT_PREFERENCE_OPTIONS: { key: ContactPreferenceValue; label: string }[] = [
  { key: 'any', label: 'Call or text me' },
  { key: 'text', label: 'Text me only' },
];

export function getContactPreferenceQuestion(companyName?: string | null): string {
  const name = companyName?.trim();
  return name ? `How may ${name} follow up about your request?` : 'How may we follow up about your request?';
}

export default function ContactPreferenceControl({
  companyName,
  value,
  onChange,
  className,
  labelClassName,
  rowClassName,
  chipClassName,
}: ContactPreferenceControlProps) {
  const question = getContactPreferenceQuestion(companyName);

  return (
    <div className={className} role="group" aria-label={question}>
      <span className={labelClassName}>{question}</span>
      <div className={rowClassName}>
        {CONTACT_PREFERENCE_OPTIONS.map((option) => {
          const isSelected = value === option.key;
          return (
            <button
              type="button"
              key={option.key}
              className={chipClassName}
              data-selected={isSelected}
              aria-pressed={isSelected}
              onClick={() => onChange(option.key)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
