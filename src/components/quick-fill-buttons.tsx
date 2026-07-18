'use client';

type QuickFillButtonsProps = {
  label: string;
  targetId: string;
  values: string[];
};

export default function QuickFillButtons({ label, targetId, values }: QuickFillButtonsProps) {
  function fillValue(value: string) {
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;

    target.value = value;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.focus();
  }

  return (
    <div className="quick-add-buttons" aria-label={label}>
      <span>{label}</span>
      {values.map((value) => (
        <button key={value} type="button" onClick={() => fillValue(value)}>
          {value}
        </button>
      ))}
    </div>
  );
}