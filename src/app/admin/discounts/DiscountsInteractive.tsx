'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './discounts.module.css';

const SCRIPTS = {
  sms: {
    title: 'Short SMS / Text Message',
    subtitle: 'Best for sending directly to a contractor friend or family contact from your phone.',
    text: `Hey [Name], we just launched Let's Get Quoted. I'm able to give a handful of close contacts our private 60% VIP Founder rate on Solo ($15.60/mo locked in for life) in exchange for some honest feedback as you use it. If you want it, let me know and I'll send you a private link!`,
  },
  email: {
    title: 'Formal Email / Deep Pitch',
    subtitle: 'Best for contractors with crews, established trade businesses, or email outreach.',
    text: `Hey [Name],

I wanted to reach out because we just launched Let's Get Quoted—built specifically for trade contractors to handle instant quoting, fast customer payments, and AI phone intake.

Rather than running a public promotion, we're giving our personal network a private 60% Lifetime VIP Founder Rate:

• Solo Plan: $15.60/month (normally $39/mo) — covers quoting, payments, client portal, and 2 office seats.
• Growth Plan: $51.60/month (normally $129/mo) — includes quick stops, time tracking, crew pay, and team management.
• Flex Tier: Zero monthly subscription, with our platform take rate cut 40% from 1.25% down to 0.75%.

This locked-in rate stays permanently as long as your account remains active. In return, all we ask is your raw, honest feedback on what works and what we can make better for you.

Let me know which plan fits your setup and I’ll generate your private code.`,
  },
  flex: {
    title: 'Flex Tier Contractor Pitch',
    subtitle: 'Best for contractors who don’t want a monthly software subscription.',
    text: `Hey [Name], if you're looking for an easier way to quote and get paid by customers without paying any monthly software fees, take a look at our Flex tier.

Normally our platform take rate is 1.25%, but I've authorized your account for our private 0.75% VIP rate. On $20,000 in monthly jobs, that puts an extra $100/mo straight into your pocket compared to standard rates. Let me know when your account is registered and I'll activate your rate!`,
  },
};

export default function DiscountsInteractive() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'sms' | 'email' | 'flex'>('sms');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(15000);
  const [lookupId, setLookupId] = useState<string>('');

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(id);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // fallback
    }
  };

  const copyScriptText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleAccountJump = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = lookupId.trim();
    if (cleanId) {
      router.push(`/admin/accounts/${cleanId}`);
    }
  };

  // Calculations
  const stdFlexFee = volume * 0.0125;
  const vipFlexFee = volume * 0.0075;
  const monthlySavings = stdFlexFee - vipFlexFee;
  const annualSavings = monthlySavings * 12;

  return (
    <div className={styles.container}>
      {/* Interactive Savings Calculator */}
      <section className={styles.calcSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
            Flex Take Rate Savings Calculator (0.75% vs 1.25%)
          </h2>
          <span style={{ fontSize: '.8rem', color: 'var(--ink-mod-grey-4, #999)' }}>
            Quote exact savings to contractors when pitching Flex
          </span>
        </div>

        <div className={styles.calcInputs}>
          <div className={styles.calcField}>
            <label htmlFor="volume-input">Contractor Monthly Card Volume ($)</label>
            <input
              id="volume-input"
              type="number"
              min="0"
              step="1000"
              value={volume}
              onChange={(e) => setVolume(Math.max(0, Number(e.target.value) || 0))}
              style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                padding: '0.6rem 0.8rem',
                borderRadius: '0.5rem',
                fontSize: '1rem',
              }}
            />
          </div>
          <div className={styles.calcField}>
            <label>Quick Preset Volumes</label>
            <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
              {[5000, 15000, 30000, 50000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVolume(v)}
                  className={styles.copyBtn}
                  style={{ opacity: volume === v ? 1 : 0.65, fontWeight: volume === v ? 700 : 400 }}
                >
                  ${(v / 1000).toFixed(0)}k/mo
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.calcResults}>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>Standard Flex (1.25%)</span>
            <span className={styles.statVal}>${stdFlexFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span style={{ fontSize: '.75rem', color: '#888' }}>per month</span>
          </div>

          <div className={styles.statBox}>
            <span className={styles.statLabel}>VIP Rate (0.75%)</span>
            <span className={styles.statVal}>${vipFlexFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span style={{ fontSize: '.75rem', color: '#888' }}>per month</span>
          </div>

          <div className={styles.statBox}>
            <span className={styles.statLabel}>Monthly Profit Kept</span>
            <span className={`${styles.statVal} ${styles.statHighlight}`}>
              +${monthlySavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span style={{ fontSize: '.75rem', color: '#22c55e' }}>extra cash in pocket</span>
          </div>

          <div className={styles.statBox}>
            <span className={styles.statLabel}>Annual Savings</span>
            <span className={`${styles.statVal} ${styles.statHighlight}`}>
              ${annualSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span style={{ fontSize: '.75rem', color: '#22c55e' }}>saved per year</span>
          </div>
        </div>
      </section>

      {/* Outreach Scripts */}
      <section className={styles.calcSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
            Ready-to-Send Outreach Scripts
          </h2>
          <span style={{ fontSize: '.8rem', color: 'var(--ink-mod-grey-4, #999)' }}>
            One-click copy templates for staff to communicate with contractors
          </span>
        </div>

        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'sms' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('sms')}
          >
            SMS / Text Message
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'email' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('email')}
          >
            Formal Email Pitch
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'flex' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('flex')}
          >
            Flex Tier Pitch
          </button>
        </div>

        <div>
          <div className={styles.scriptBoxHead}>
            <div>
              <strong style={{ fontSize: '.9rem', color: '#fff' }}>{SCRIPTS[activeTab].title}</strong>
              <p style={{ margin: '.1rem 0 0', fontSize: '.78rem', color: '#999' }}>{SCRIPTS[activeTab].subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => copyScriptText(SCRIPTS[activeTab].text)}
              className={styles.copyBtn}
              style={{ padding: '0.4rem 0.8rem', fontSize: '.8rem' }}
            >
              {copiedScript ? '✓ Copied to Clipboard!' : 'Copy Script'}
            </button>
          </div>
          <div className={styles.scriptBox}>
            {SCRIPTS[activeTab].text}
          </div>
        </div>
      </section>

      {/* Account Quick Jump */}
      <section className={styles.calcSection} style={{ padding: '1.2rem 1.5rem' }}>
        <form onSubmit={handleAccountJump} style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <label htmlFor="account-jump-id" style={{ fontSize: '.88rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
            Jump to Account to Apply Fee:
          </label>
          <input
            id="account-jump-id"
            type="text"
            placeholder="Account UUID (e.g. 10000000-0000-4000-8000-...)"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            style={{
              flex: '1 1 280px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#fff',
              padding: '0.5rem 0.8rem',
              borderRadius: '0.5rem',
              fontSize: '.85rem',
            }}
          />
          <button type="submit" className="btn secondary" style={{ padding: '0.5rem 1rem' }}>
            Open Account →
          </button>
        </form>
      </section>
    </div>
  );
}
