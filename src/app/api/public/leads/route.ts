import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { sendLeadNotificationEmail } from '@/lib/email';
import { createLead } from '@/lib/leads';
import { deleteLeadPhotos, uploadLeadPhoto } from '@/lib/lead-photo-storage';
import { getSiteContent } from '@/lib/site-content';

export const runtime = 'nodejs';

function text(data: FormData, key: string, maxLength: number) {
  return String(data.get(key) ?? '').trim().slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  const data = await request.formData();
  if (text(data, 'company', 100)) return NextResponse.json({ ok: true });
  const startedAt = Number(data.get('startedAt'));
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < 1800) {
    return NextResponse.json({ error: 'Please take a moment to complete the form.' }, { status: 400 });
  }

  const siteId = text(data, 'siteId', 80);
  const name = text(data, 'name', 100);
  const phone = text(data, 'phone', 40);
  const email = text(data, 'email', 160).toLowerCase();
  const message = text(data, 'message', 3000);
  if (!siteId || !name) {
    return NextResponse.json({ error: 'Add your name to send this request.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: site } = await admin
    .from('sites')
    .select('id, account_id, company_name, subdomain, custom_domain, published, content')
    .eq('id', siteId)
    .eq('published', true)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: 'This website is not accepting requests.' }, { status: 404 });

  const quoteForm = getSiteContent(site.content).quoteForm;
  if (quoteForm.emailRequired && !email) {
    return NextResponse.json({ error: 'Add your email address so the contractor can follow up.' }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ error: 'Add a phone number or email so the contractor can follow up.' }, { status: 400 });
  }

  const photos = data.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0).slice(0, 6);
  const photoPaths: string[] = [];
  try {
    for (const photo of photos) photoPaths.push(await uploadLeadPhoto(site.account_id, photo));
    const lead = await createLead(admin, site.account_id, {
      name,
      phone,
      email,
      address: text(data, 'address', 240),
      projectType: text(data, 'projectType', 100),
      message,
      photoPaths,
      sourcePage: request.headers.get('referer'),
    });

    const { data: owner } = await admin.from('memberships').select('user_id').eq('account_id', site.account_id).eq('role', 'owner').limit(1).maybeSingle();
    if (owner?.user_id) {
      const { data: ownerUser } = await admin.auth.admin.getUserById(owner.user_id);
      if (ownerUser.user?.email) {
        try {
          await sendLeadNotificationEmail({
            recipientEmail: ownerUser.user.email,
            businessName: site.company_name,
            lead,
            dashboardUrl: `${request.nextUrl.origin}/dashboard/leads/${lead.id}`,
          });
        } catch (error) {
          console.error('Lead notification email failed:', error);
        }
      }
    }

    return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
  } catch (error) {
    await deleteLeadPhotos(site.account_id, photoPaths);
    console.error('Public lead intake failed:', error);
    return NextResponse.json({ error: 'Unable to send your request right now.' }, { status: 500 });
  }
}