'use client';

import { useState } from 'react';
import styles from './admin.module.css';

export type ShiftNote = {
  id: string;
  author_email: string;
  body: string;
  created_at: string;
};

export function ShiftNotesWidget({ notes, onAddNote }: { notes: ShiftNote[], onAddNote: (body: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await onAddNote(body);
      setBody('');
      setAdding(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.boardCard} style={{ gridColumn: '1 / -1', marginBottom: '1.5rem' }}>
      <div className={styles.cardHead}>
        <h2 className={styles.panelTitle}>Shift Handoff & Ops Notes</h2>
        {!adding && (
          <button type="button" className="btn secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setAdding(true)}>
            + Add Note
          </button>
        )}
      </div>
      <div className={styles.cardBody}>
        {adding && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <textarea 
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="What should the next shift know?"
              style={{ width: '100%', minHeight: '60px', padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.8rem' }}
              disabled={submitting}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn secondary" style={{ fontSize: '0.75rem' }} onClick={() => setAdding(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn primary" style={{ fontSize: '0.75rem' }} disabled={submitting || !body.trim()}>Save Note</button>
            </div>
          </form>
        )}
        
        {notes.length === 0 ? (
          <p className={styles.cardEmpty}>No recent shift notes.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {notes.map(note => (
              <div key={note.id} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', borderLeft: '2px solid var(--accent, #ff7a21)' }}>
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{note.body}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(247,245,239,0.5)' }}>
                  <span>{note.author_email}</span>
                  <span>{new Date(note.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
