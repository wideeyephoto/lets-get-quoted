import type { Metadata } from 'next';
import React from 'react';
import { CircleHelp, ShieldAlert, ShieldCheck } from 'lucide-react';
import { getPublicIncidentStatus } from '@/lib/public-incident-status';
import type { PublicIncident } from '@/lib/platform-incidents';
import styles from './status.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Platform status',
  description: 'Current reported incidents and recent service updates for Let’s Get Quoted.',
  alternates: { canonical: '/status' },
  openGraph: { title: 'Platform status', url: '/status', description: 'Reported incidents and service updates.' },
};

function timestamp(value: string) {
  return new Date(value).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC';
}

function Incident({ incident }: { incident: PublicIncident }) {
  return <article className={styles.incident} data-incident-id={incident.id}>
    <header>
      <h3>{incident.title}</h3>
      <span className={styles.badge}>{incident.kind === 'release' ? 'Release' : incident.resolved_at ? 'Resolved' : incident.severity}</span>
    </header>
    {incident.affected_services.length > 0 && <p className={styles.meta}>Affected services: {incident.affected_services.join(', ')}</p>}
    {incident.description && <p className={styles.copy}>{incident.description}</p>}
    {incident.impact_summary && <p className={styles.copy}><strong>Customer impact:</strong> {incident.impact_summary}</p>}
    {incident.resolved_at && incident.resolution_summary && <div className={styles.resolution}>
      <h4>Resolution</h4><p className={styles.copy}>{incident.resolution_summary}</p>
    </div>}
    <div className={styles.meta}>
      <div>Started: <time dateTime={incident.started_at}>{timestamp(incident.started_at)}</time></div>
      <div>Updated: <time dateTime={incident.updated_at}>{timestamp(incident.updated_at)}</time></div>
      {incident.resolved_at && <div>Resolved: <time dateTime={incident.resolved_at}>{timestamp(incident.resolved_at)}</time></div>}
    </div>
  </article>;
}

export default async function StatusPage() {
  const { available, active, history } = await getPublicIncidentStatus();
  const state = !available ? 'unknown' : active.length ? 'active' : 'clear';
  const Icon = !available ? CircleHelp : active.length ? ShieldAlert : ShieldCheck;
  return <div className={styles.page}>
    <p className={styles.eyebrow}>Let’s Get Quoted · Service updates</p>
    <h1>Platform status</h1>
    <p className={styles.intro}>Reported incidents, customer impact, and recovery updates from our operations team. Times are shown in UTC.</p>
    <section className={`${styles.summary} ${styles[state]}`} data-status={state} aria-labelledby="current-status">
      <Icon size={30} aria-hidden="true" />
      <div>
        <h2 id="current-status">{!available ? 'Status temporarily unavailable' : active.length ? 'Service disruption reported' : 'No active incidents reported'}</h2>
        <p>{!available ? 'We could not load the latest incident reports. Service health is unconfirmed. Please try again shortly.' : active.length ? 'Our team is working on the incidents below. Refresh this page for the latest update.' : 'There are no open published incidents at this time. Refresh this page for the latest reports.'}</p>
      </div>
    </section>
    {available && <>
      {active.length > 0 && <section className={styles.section} aria-labelledby="active-incidents">
        <h2 id="active-incidents">Active incidents</h2>
        {active.map((incident) => <Incident key={incident.id} incident={incident} />)}
      </section>}
      <section className={styles.section} aria-labelledby="incident-history">
        <h2 id="incident-history">Recent incident history</h2>
        <p className={styles.meta}>The latest 10 resolved incidents and releases.</p>
        {history.length ? history.map((incident) => <Incident key={incident.id} incident={incident} />) : <p>No published history yet.</p>}
      </section>
    </>}
    <p className={styles.intro}>Need help with your account? <a href="/contact">Contact support</a>.</p>
  </div>;
}
