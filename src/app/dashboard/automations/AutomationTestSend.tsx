'use client';

import { useState, useTransition } from 'react';

type Props = {
  action: () => Promise<{ ok: boolean; message: string }>;
  label?: string;
  pendingLabel?: string;
  savedLabel?: string;
  className?: string;
  note?: string;
};

export default function AutomationTestSend({
  action,
  label = 'Send a test',
  pendingLabel = 'Sending…',
  savedLabel = 'Test sent ✓',
  className = 'btn ghost',
  note,
}: Props) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [, startTransition] = useTransition();

  function sendTest() {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    startTransition(async () => {
      try {
        const result = await action();
        setTestResult(result);
      } catch (error) {
        setTestResult({
          ok: false,
          message: error instanceof Error ? error.message : 'Could not send the test.',
        });
      } finally {
        setTesting(false);
      }
    });
  }

  return (
    <div className="reminder-test">
      <button
        type="button"
        className={className}
        onClick={sendTest}
        disabled={testing}
        aria-busy={testing}
      >
        {testing ? pendingLabel : testResult?.ok ? savedLabel : label}
      </button>
      {note ? <small>{note}</small> : null}
      {testResult ? (
        <p
          className="automation-test-note"
          role="status"
          style={{
            width: '100%',
            margin: '0.4rem 0 0',
            fontSize: '0.78rem',
            color: testResult.ok ? 'var(--mute-t60)' : 'var(--danger, #ef4444)',
          }}
        >
          {testResult.ok
            ? (testResult.message.startsWith('Sent') ? `Test sent. ${testResult.message}` : testResult.message)
            : testResult.message}
        </p>
      ) : null}
    </div>
  );
}
