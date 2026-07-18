'use client';

type QuickFillButtonsProps = {
  label: string;
  targetId: string;
  values: Array<string | { label: string; value: string }>;
};

export default function QuickFillButtons({ label, targetId, values }: QuickFillButtonsProps) {
  function fillValue(value: string) {
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;

    target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.focus();
  }

  return (
    <div className="quick-add-buttons" aria-label={label}>
      <span>{label}</span>
      {values.map((item) => {
        const label = typeof item === 'string' ? item : item.label;
        const value = typeof item === 'string' ? item : item.value;

        return (
          <button key={value} type="button" onClick={() => fillValue(value)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}