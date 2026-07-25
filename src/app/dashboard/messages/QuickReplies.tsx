'use client';

// Canned-reply chips above the inbox reply box. Tapping one drops the saved text
// into the reply textarea (found by id) so the owner can tweak and send.
export default function QuickReplies({ templates, targetId }: { templates: { id: string; title: string; body: string }[]; targetId: string }) {
  if (templates.length === 0) return null;

  function apply(body: string) {
    const el = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!el) return;
    el.value = body;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  return (
    <div className="quick-replies" aria-label="Saved replies">
      {templates.map((template) => (
        <button key={template.id} type="button" className="quick-reply-chip" onClick={() => apply(template.body)} title={template.body}>
          {template.title}
        </button>
      ))}
    </div>
  );
}
