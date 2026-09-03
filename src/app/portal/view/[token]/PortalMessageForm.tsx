'use client';

import { useState, useTransition } from 'react';
import { sendPortalMessageAction } from './actions';
import MailIcon from '@/components/MailIcon';

type Props = {
  token: string;
  businessName: string;
  jobs?: Array<{ id: string; ref: string | null; scope: string | null }>;
};

export function PortalMessageForm({ token, businessName, jobs = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');

  return (
    <form
      action={(formData) => {
        setStatus(null);
        startTransition(async () => {
          if (selectedJobId) {
            formData.set('jobId', selectedJobId);
          }
          const res = await sendPortalMessageAction(token, formData);
          if (res.ok) {
            setStatus({ type: 'success', text: `Your message was sent directly to ${businessName}.` });
            const form = document.getElementById('portal-msg-form') as HTMLFormElement | null;
            form?.reset();
          } else {
            setStatus({ type: 'error', text: res.message || 'Failed to send message. Please try again.' });
          }
        });
      }}
      id="portal-msg-form"
      className="portal-message-form"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}
    >
      {jobs.length > 0 ? (
        <div>
          <label
            htmlFor="portal-job-select"
            style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', marginBottom: '0.25rem' }}
          >
            Regarding Project (Optional)
          </label>
          <select
            id="portal-job-select"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="input-field"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--edge-t16, #cbd5e1)',
              background: 'var(--surface-color, #ffffff)',
              fontSize: '0.9rem',
            }}
          >
            <option value="">General Question / Service Inquiry</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.scope || job.ref || 'Project'} {job.ref ? `(${job.ref})` : ''}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label
          htmlFor="portal-msg-input"
          style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted, #64748b)', marginBottom: '0.25rem' }}
        >
          Message {businessName}
        </label>
        <textarea
          id="portal-msg-input"
          name="message"
          rows={3}
          required
          placeholder={`Have a question about a quote, project, warranty or schedule? Write to ${businessName} here...`}
          className="input-field"
          style={{
            width: '100%',
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            border: '1px solid var(--edge-t16, #cbd5e1)',
            background: 'var(--surface-color, #ffffff)',
            fontSize: '0.9rem',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={isPending}
          className="btn primary"
          style={{ padding: '0.5rem 1.1rem', fontSize: '0.88rem' }}
        >
          {isPending ? 'Sending...' : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <MailIcon /> Send to {businessName}
            </span>
          )}
        </button>
        {status ? (
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 500,
              color: status.type === 'success' ? '#16a34a' : '#dc2626',
            }}
          >
            {status.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
