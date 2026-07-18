import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import PhotoGallery from '@/components/photo-gallery';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import { createLeadPhotoUrls } from '@/lib/lead-photo-storage';
import { expireStaleLeads, formatElapsedTime, formatLeadSource, getLead } from '@/lib/leads';
import { convertLeadAction } from '../actions';
import SaveButton from '@/components/save-button';
import TimeSlotSelect from '@/components/time-slot-select';
import styles from '../leads.module.css';

export default async function LeadDetailPage({ params }: { params: { leadId: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  await expireStaleLeads(supabase, accountId);
  const lead = await getLead(supabase, accountId, params.leadId);
  if (!lead) notFound();
  const photoUrls = await createLeadPhotoUrls(accountId, lead.photo_paths || []);
  const photos = (lead.photo_paths || []).map((path, index) => ({ path, url: photoUrls[index] })).filter((photo) => photo.url);
  const convertLead = convertLeadAction.bind(null, lead.id);
  const convertedJobLabel = lead.status === 'won' ? 'Open job' : 'Open quote';

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero workspace-hero-solo panel">
        <div className="workspace-hero-copy"><p className="eyebrow">Lead details</p><h1 className="workspace-title">{lead.name || 'Unnamed lead'}</h1><div className={styles.detailBadges}><span className={styles.source}>{formatLeadSource(lead.source)}</span><span className={styles.receivedBadge}>Received {formatElapsedTime(lead.created_at)} ago</span></div><div className="actions workspace-actions"><Link className="btn secondary" href="/dashboard/leads">Back to leads</Link>{lead.converted_job && <Link className="btn primary" href={`/dashboard/jobs/${lead.converted_job}`}>{convertedJobLabel}</Link>}</div></div>
      </section>

      <div className={styles.detailGrid}>
        <section className={`panel workspace-section-card ${styles.detailSection}`}>
          <div className="section-heading workspace-section-heading"><p className="eyebrow">Request</p><h2>{lead.project_type || 'Project request'}</h2></div>
          <div className={styles.contactGrid}>
            <div className={styles.dataBlock}><span>Phone</span>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : <p>Not provided</p>}</div>
            <div className={styles.dataBlock}><span>Email</span>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : <p>Not provided</p>}</div>
          </div>
          <div className={styles.dataBlock}><span>Project address</span><p>{lead.address || 'Not provided'}</p></div>
          <div className={styles.dataBlock}><span>Estimated hours</span><p>{lead.estimated_hours ? `${lead.estimated_hours} hrs` : 'Not estimated yet'}</p></div>
          <div className={styles.dataBlock}><span>Project details</span><p>{lead.message || 'Not provided'}</p></div>
          <div>
            <div className="section-heading workspace-section-heading"><p className="eyebrow">Attachments</p><h2>Project photos</h2></div>
            <PhotoGallery
              entityId={lead.id}
              entityField="leadId"
              uploadUrl="/api/lead-photos"
              initialPhotos={photos}
              emptyLabel="No photos yet. Add some from the field or from the client."
            />
          </div>
          <div className={styles.dataBlock}><span>Received</span><p>{formatElapsedTime(lead.created_at)} ago</p><small>{new Date(lead.created_at).toLocaleString()}</small></div>
        </section>

        <aside className={styles.actionPanel}>
          {!lead.converted_job && <section className="panel workspace-section-card"><div className="section-heading workspace-section-heading"><p className="eyebrow">Next step</p><h2>Send quote / estimate</h2></div><p>Send the initial quote from this lead. It stays in Leads as Quoted, then becomes an active job when the homeowner signs off.</p><form action={convertLead} className={styles.actionForm}><label htmlFor="quotedAmount">Quoted amount ($)</label><input id="quotedAmount" name="quotedAmount" type="number" min="0" step="0.01" placeholder="0.00" /><label htmlFor="estimatedHours">Estimated hours</label><input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={lead.estimated_hours ?? ''} placeholder="16" /><div className="workspace-section-divider"><div className="section-heading workspace-section-heading"><p className="eyebrow">Client scheduling</p><h2>Suggest 3 times</h2></div><span className="recommended-note">Optional, recommended</span><p className="workspace-card-copy">Text three service options with the initial quote so the client can book quickly. Leave these blank to send only the quote.</p></div>{[1, 2, 3].map((optionNumber) => (<div className="schedule-option-grid" key={optionNumber}><div><label htmlFor={`quoteScheduleDate${optionNumber}`}>Option {optionNumber} date</label><ScheduledDatePicker id={`quoteScheduleDate${optionNumber}`} name={`quoteScheduleDate${optionNumber}`} /></div><div><label htmlFor={`quoteScheduleTime${optionNumber}`}>Option {optionNumber} time</label><TimeSlotSelect id={`quoteScheduleTime${optionNumber}`} name={`quoteScheduleTime${optionNumber}`} /></div></div>))}<label className="sms-consent-check"><input name="quoteScheduleSmsConsent" type="checkbox" /><span>The client agreed to receive transactional scheduling texts. Required only when sending quick booking options. Reply STOP to opt out.</span></label><SaveButton>Send quote</SaveButton></form></section>}
        </aside>
      </div>
    </main>
  );
}