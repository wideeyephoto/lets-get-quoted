const fs = require('fs');
let code = fs.readFileSync('src/app/portal/view/[token]/actions.ts', 'utf-8');

const actions = `
export async function markPortalMessagesReadAction(token: string) {
  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, token);
  if (access) {
    try {
      await admin.from('client_portal_access').update({ last_read_at: new Date().toISOString() }).eq('account_id', access.accountId).eq('client_id', access.clientId);
    } catch {}
  }
}

export async function loadMorePortalMessagesAction(token: string, cursorDate: string) {
  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, token);
  if (!access) return [];

  const [{ data: client }, { data: account }] = await Promise.all([
    admin.from('clients').select('phone').eq('account_id', access.accountId).eq('id', access.clientId).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', access.accountId).maybeSingle()
  ]);

  const { data: jobsRows } = await admin.from('jobs').select('id').eq('account_id', access.accountId).eq('client_id', access.clientId);
  const jobIds = (jobsRows || []).map((j: any) => j.id);
  const clientPhone = client?.phone || null;
  const businessName = account?.business_name || 'Contractor';

  const [{ data: smsRows }, { data: feedRows }] = await Promise.all([
    clientPhone
      ? admin
          .from('sms_messages')
          .select('id, direction, body, media_urls, created_at')
          .eq('account_id', access.accountId)
          .eq('phone_number', clientPhone)
          .lt('created_at', cursorDate)
          .order('created_at', { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? admin
          .from('job_feed')
          .select('id, kind, body, author, created_at, visibility, job_id')
          .eq('account_id', access.accountId)
          .in('job_id', jobIds)
          .eq('visibility', 'public')
          .lt('created_at', cursorDate)
          .order('created_at', { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),
  ]);

  const messages: any[] = [];
  if (smsRows) {
    for (const r of smsRows) {
      messages.push({
        id: r.id,
        body: r.body as string,
        createdAt: r.created_at as string,
        direction: r.direction as 'inbound' | 'outbound',
        sender: r.direction === 'inbound' ? 'You' : businessName,
        mediaUrls: (r.media_urls as string[]) || [],
        jobId: null,
      });
    }
  }
  if (feedRows) {
    for (const r of feedRows) {
      messages.push({
        id: r.id,
        body: r.body as string,
        createdAt: r.created_at as string,
        direction: 'outbound' as const,
        sender: (r.author as string) || businessName,
        mediaUrls: [],
        jobId: r.job_id as string,
      });
    }
  }

  messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return messages.slice(0, 15);
}
`;

fs.writeFileSync('src/app/portal/view/[token]/actions.ts', code + '\n' + actions);
