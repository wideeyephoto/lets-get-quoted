import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import ScheduleNav from '../ScheduleNav';
import { NavIcon } from '@/components/nav-icons';

export const metadata: Metadata = {
  title: 'Intake Channels | Schedule',
  description: 'Manage automated intake channels feeding into your schedule: Online Booking, Quick Stops, Text-to-Job, and AI Receptionist.',
};

export default async function ScheduleIntakePage() {
  const { supabase, accountId } = await requireOfficeContext('schedule.read');

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase
      .from('accounts')
      .select('booking_enabled, quick_stops_enabled, quick_stops_paused_by_support, call_tracking_number')
      .eq('id', accountId)
      .maybeSingle(),
    supabase
      .from('sites')
      .select('published, subdomain')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  const bookingOn = Boolean(account?.booking_enabled);
  const sitePublished = Boolean(site?.published);
  const bookingStatus = !bookingOn ? 'OFF' : sitePublished ? 'ON' : 'NOT LIVE';

  const qsEnabled = Boolean(account?.quick_stops_enabled);
  const qsPaused = Boolean(account?.quick_stops_paused_by_support);
  const quickStopsStatus = qsPaused ? 'PAUSED' : qsEnabled ? 'ON' : 'OFF';

  const CHANNELS = [
    {
      id: 'booking',
      title: 'Online Booking',
      icon: '/dashboard/schedule/booking',
      href: '/dashboard/schedule/booking',
      status: bookingStatus,
      description: 'Allows customers to select open slots directly from your website within your configured arrival windows.',
      actionLabel: 'Configure booking windows',
    },
    {
      id: 'quick-stops',
      title: 'Quick Stops',
      icon: '/dashboard/quick-stops',
      href: '/dashboard/quick-stops',
      status: quickStopsStatus,
      description: 'Lets nearby customers pay a priority fee to be fitted into your day when route capacity allows.',
      actionLabel: 'Manage zones & rates',
    },
    {
      id: 'text-to-job',
      title: 'Text-to-Job (Voice & SMS)',
      icon: '/dashboard/text-to-job',
      href: '/dashboard/text-to-job',
      status: 'ON',
      description: 'Turn field voice memos, customer texts, and inspection photos directly into scheduled appointments.',
      actionLabel: 'View field memo stream',
    },
    {
      id: 'voice',
      title: '24/7 AI Receptionist',
      icon: '/dashboard/voice-calls',
      href: '/dashboard/voice-calls',
      status: account?.call_tracking_number ? 'ON' : 'OFF',
      description: 'Answers inbound customer calls 24/7, screens inquiries, quotes repairs, and books appointments.',
      actionLabel: 'Configure call handling',
    },
  ];

  return (
    <div className="workspace" style={{ maxWidth: '1180px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <ScheduleNav />

      <header style={{ marginBottom: '2rem' }}>
        <h1 className="workspace-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
          Schedule Intake Channels
        </h1>
        <p style={{ color: 'var(--mute-t58, rgba(255, 255, 255, 0.65))', marginTop: '0.4rem', fontSize: '0.95rem' }}>
          Four automated channels that feed jobs directly onto your calendar. Toggle and configure your switches below.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {CHANNELS.map((ch) => {
          const isLive = ch.status === 'ON';
          const isPaused = ch.status === 'PAUSED' || ch.status === 'NOT LIVE';
          const pillColor = isLive
            ? 'var(--ink-green-11, #3dd68c)'
            : isPaused
              ? 'var(--ink-amber-11, #ffb020)'
              : 'var(--mute-t40, rgba(255, 255, 255, 0.4))';
          const pillBg = isLive
            ? 'rgba(61, 214, 140, 0.12)'
            : isPaused
              ? 'rgba(255, 176, 32, 0.12)'
              : 'rgba(255, 255, 255, 0.08)';

          return (
            <div
              key={ch.id}
              style={{
                background: 'var(--surface-raised, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--rule-t10, rgba(255, 255, 255, 0.08))',
                borderRadius: '10px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <NavIcon href={ch.icon} />
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 650, margin: 0 }}>{ch.title}</h2>
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                      color: pillColor,
                      backgroundColor: pillBg,
                    }}
                  >
                    {ch.status}
                  </span>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--mute-t58, rgba(255, 255, 255, 0.65))', lineHeight: 1.5, margin: 0 }}>
                  {ch.description}
                </p>
              </div>

              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--rule-t06, rgba(255, 255, 255, 0.05))' }}>
                <Link
                  href={ch.href}
                  className="btn secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    padding: '0.6rem 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  {ch.actionLabel} &rarr;
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
