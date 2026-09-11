import type { PlatformIncidentRow } from '@/lib/admin-alerts';
import { togglePublishIncidentAction, updatePublicIncidentAction } from './actions';
import styles from '../admin.module.css';

export default function IncidentPublicationControls({ incident }: { incident: PlatformIncidentRow }) {
  return <div style={{ marginTop: 12 }}>
    <form action={togglePublishIncidentAction}>
      <input type="hidden" name="incident_id" value={incident.id} />
      <input type="hidden" name="published" value={incident.published ? 'false' : 'true'} />
      <button type="submit" className="btn secondary">{incident.published ? 'Unpublish' : 'Publish to status page'}</button>
    </form>
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer' }}>Edit public update</summary>
      <form action={updatePublicIncidentAction.bind(null, incident.id)} className={styles.formStack} style={{ marginTop: 12 }} aria-label={`Update ${incident.title}`}>
        <p className={styles.muted}>Published updates appear on the public status page. Keep customer details, staff contacts, and investigation notes out of this copy.</p>
        <label htmlFor={`title-${incident.id}`}>Public title</label>
        <input id={`title-${incident.id}`} name="title" className={styles.input} defaultValue={incident.title} required maxLength={200} />
        <label htmlFor={`description-${incident.id}`}>Public update</label>
        <textarea id={`description-${incident.id}`} name="description" className={styles.input} defaultValue={incident.description ?? ''} maxLength={4000} rows={3} />
        <label htmlFor={`impact-${incident.id}`}>Customer impact</label>
        <textarea id={`impact-${incident.id}`} name="impact_summary" className={styles.input} defaultValue={incident.impact_summary ?? ''} maxLength={2000} rows={2} />
        <label htmlFor={`services-${incident.id}`}>Affected services</label>
        <input id={`services-${incident.id}`} name="affected_services" className={styles.input} defaultValue={incident.affected_services.join(', ')} />
        <button type="submit" className="btn secondary">Save public update</button>
      </form>
    </details>
  </div>;
}
