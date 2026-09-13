'use client';

import { useState, useTransition } from 'react';
import {
  CIRCUIT_BREAKER_SERVICES,
  type CircuitBreakerRow,
  type CircuitBreakerService,
} from '@/lib/circuit-breaker';
import { tripCircuitBreakerAction, clearCircuitBreakerAction } from './circuit-breaker-actions';
import styles from '../admin.module.css';

const SERVICES: CircuitBreakerService[] = ['ai_intake', 'sms_outbound', 'voice_routing', 'payments_checkout'];

export function CircuitBreakerPanel({
  initialBreakers,
  canManage,
}: {
  initialBreakers: CircuitBreakerRow[];
  canManage: boolean;
}) {
  const [breakers, setBreakers] = useState<CircuitBreakerRow[]>(initialBreakers);
  const [isPending, startTransition] = useTransition();
  const [activeDialog, setActiveDialog] = useState<{ service: CircuitBreakerService; action: 'trip' | 'clear'; breakerId?: string } | null>(null);
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const globalActive = breakers.filter((b) => b.is_tripped && b.scope === 'global');
  const accountActive = breakers.filter((b) => b.is_tripped && b.scope === 'account');

  const handleTrip = (service: CircuitBreakerService) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setReason('');
    setActiveDialog({ service, action: 'trip' });
  };

  const handleClear = (service: CircuitBreakerService, breakerId: string) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setReason('');
    setActiveDialog({ service, action: 'clear', breakerId });
  };

  const submitAction = () => {
    if (!activeDialog) return;
    if (reason.trim().length < 4) {
      setErrorMsg('Please enter an operational reason of at least 4 characters.');
      return;
    }

    startTransition(async () => {
      if (activeDialog.action === 'trip') {
        const res = await tripCircuitBreakerAction(activeDialog.service, 'global', null, reason.trim());
        if (!res.success) {
          setErrorMsg(res.message);
        } else {
          setStatusMsg(res.message);
          setActiveDialog(null);
          // Optimistically update local view
          setBreakers((prev) => [
            ...prev,
            {
              id: `temp-${Date.now()}`,
              service: activeDialog.service,
              scope: 'global',
              account_id: null,
              is_tripped: true,
              reason: reason.trim(),
              tripped_by: 'you',
              tripped_at: new Date().toISOString(),
              cleared_by: null,
              cleared_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ]);
        }
      } else if (activeDialog.action === 'clear' && activeDialog.breakerId) {
        const res = await clearCircuitBreakerAction(activeDialog.breakerId, reason.trim());
        if (!res.success) {
          setErrorMsg(res.message);
        } else {
          setStatusMsg(res.message);
          setActiveDialog(null);
          setBreakers((prev) => prev.filter((b) => b.id !== activeDialog.breakerId));
        }
      }
    });
  };

  return (
    <section className={styles.panel} style={{ marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <h2 className={styles.panelTitle} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>⚡ Emergency Kill Switches & Circuit Breakers</span>
          {globalActive.length > 0 && (
            <span className={`${styles.statusPill} ${styles.bad}`} style={{ fontSize: '0.72rem' }}>
              {globalActive.length} Subsystem{globalActive.length === 1 ? '' : 's'} Halted
            </span>
          )}
        </h2>
      </div>

      <p className={styles.muted} style={{ margin: '0 0 1rem', fontSize: '0.78rem', lineHeight: 1.5 }}>
        Server-side circuit breakers halt incoming or outgoing subsystem traffic immediately without a code release.
        Requires <code>ops.manage</code> with MFA verification.
      </p>

      {statusMsg && (
        <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: 6, color: '#34d399', fontSize: '0.8rem', marginBottom: '1rem' }}>
          ✓ {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: 6, color: '#f87171', fontSize: '0.8rem', marginBottom: '1rem' }}>
          ⚠ {errorMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        {SERVICES.map((srv) => {
          const info = CIRCUIT_BREAKER_SERVICES[srv];
          const active = globalActive.find((b) => b.service === srv);
          const isHalted = Boolean(active);

          return (
            <div
              key={srv}
              style={{
                background: isHalted ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                border: isHalted ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: isHalted ? '#f87171' : 'inherit' }}>{info.label}</strong>
                  <span className={`${styles.statusPill} ${isHalted ? styles.bad : styles.good}`} style={{ fontSize: '0.7rem' }}>
                    {isHalted ? 'HALTED' : 'NORMAL'}
                  </span>
                </div>
                <p style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.7)', margin: '0 0 0.5rem' }}>
                  {info.description}
                </p>
                <p style={{ fontSize: '0.72rem', color: isHalted ? '#fca5a5' : 'rgba(255,255,255,0.45)', margin: '0 0 0.8rem' }}>
                  <strong>Impact:</strong> {info.impact}
                </p>

                {active && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: 4, fontSize: '0.72rem', marginBottom: '0.8rem' }}>
                    <div style={{ color: '#f87171', fontWeight: 600 }}>Halt Reason:</div>
                    <div>{active.reason}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: '0.2rem' }}>
                      Tripped by {active.tripped_by} · {new Date(active.tripped_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )}
              </div>

              {canManage && (
                <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.7rem' }}>
                  {isHalted && active ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleClear(srv, active.id)}
                      className={styles.btnSecondary}
                      style={{ width: '100%', fontSize: '0.78rem', padding: '0.4rem', color: '#34d399', borderColor: '#10b981' }}
                    >
                      {isPending ? 'Processing…' : '✓ Restore Service'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleTrip(srv)}
                      className={styles.btnDanger}
                      style={{ width: '100%', fontSize: '0.78rem', padding: '0.4rem' }}
                    >
                      {isPending ? 'Processing…' : '⚠ Trip Kill Switch'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {accountActive.length > 0 && (
        <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <h4 style={{ fontSize: '0.8rem', margin: '0 0 0.4rem', color: 'rgba(255,255,255,0.85)' }}>
            Active Account-Scoped Kill Switches ({accountActive.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {accountActive.map((b) => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.4rem 0.6rem', borderRadius: 4, fontSize: '0.75rem' }}>
                <span>
                  <strong>{CIRCUIT_BREAKER_SERVICES[b.service].label}</strong> halted for account <code>{b.account_id?.slice(0, 8)}…</code>: {b.reason}
                </span>
                {canManage && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleClear(b.service, b.id)}
                    style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.72rem' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            background: '#1a1d24',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            maxWidth: 480,
            width: '100%',
            padding: '1.5rem',
          }}>
            <h3 style={{ margin: '0 0 0.6rem', fontSize: '1rem', color: activeDialog.action === 'trip' ? '#f87171' : '#34d399' }}>
              {activeDialog.action === 'trip' ? '⚠ Confirm Emergency Kill Switch' : '✓ Confirm Service Restoration'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', margin: '0 0 1rem', lineHeight: 1.5 }}>
              {activeDialog.action === 'trip'
                ? `You are about to immediately HALT ${CIRCUIT_BREAKER_SERVICES[activeDialog.service].label} across the platform. All affected traffic will be suppressed or diverted.`
                : `You are restoring ${CIRCUIT_BREAKER_SERVICES[activeDialog.service].label} to normal production operation.`}
            </p>

            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, marginBottom: '0.4rem', color: 'rgba(255,255,255,0.9)' }}>
                Operational Reason (Required, min 4 characters):
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={activeDialog.action === 'trip' ? 'e.g. Gemini API latency spike causing prompt loop, pausing intake while investigating.' : 'e.g. Upstream API incident resolved and verified healthy.'}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 4,
                  color: '#fff',
                  padding: '0.5rem',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setActiveDialog(null)}
                className={styles.btnSecondary}
                style={{ fontSize: '0.8rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || reason.trim().length < 4}
                onClick={submitAction}
                className={activeDialog.action === 'trip' ? styles.btnDanger : styles.btnPrimary}
                style={{ fontSize: '0.8rem' }}
              >
                {isPending ? 'Confirming…' : activeDialog.action === 'trip' ? 'Confirm Halt' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
