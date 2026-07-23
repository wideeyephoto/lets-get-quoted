import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { sendLeadNotificationEmail } from '@/lib/email';
import { createLead, getLeadTriage, LEAD_PRUNE_FLAGS, type LeadTriage } from '@/lib/leads';
import { deleteLeadPhotos, uploadLeadPhoto } from '@/lib/lead-photo-storage';
import { isLeadVerificationValid } from '@/lib/lead-verification';
import { normalizeUsPhone } from '@/lib/phone';
import { getSiteContent } from '@/lib/site-content';
import { isSmsConfigured } from '@/lib/sms';

export const runtime = 'nodejs';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(data: FormData, key: string, maxLength: number) {
  return String(data.get(key) ?? '').trim().slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  const data = await request.formData();
  // Honeypot. NOTE: never name this field "company" (or anything else
  // autofill recognizes) — browser autofill/password managers fill such
  // fields and silently drop real visitors as "bots". The legacy 'company'
  // field is deliberately IGNORED so stale pages don't keep losing leads.
  if (text(data, 'lgq_trap', 100)) return NextResponse.json({ ok: true });
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
  if (phone && !normalizeUsPhone(phone)) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }
  if (email && !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: site } = await admin
    .from('sites')
    .select('id, account_id, company_name, subdomain, custom_domain, published, content')
    .eq('id', siteId)
    .eq('published', true)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: 'This website is not accepting requests.' }, { status: 404 });

  const siteContent = getSiteContent(site.content);
  const quoteForm = siteContent.quoteForm;
  if (quoteForm.emailRequired && !email) {
    return NextResponse.json({ error: 'Add your email address so the contractor can follow up.' }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ error: 'Add a valid phone number or email so the contractor can follow up.' }, { status: 400 });
  }

  const normalizedPhone = phone ? normalizeUsPhone(phone) : null;

  // Blocked contacts are silently dropped — the visitor sees success, the
  // owner's inbox stays clean, and the blocked party learns nothing.
  if (normalizedPhone || email) {
    const conditions = [
      ...(normalizedPhone ? [`phone.eq.${normalizedPhone}`] : []),
      ...(email ? [`email.eq.${email}`] : []),
    ].join(',');
    const { data: blocked } = await admin
      .from('lead_blocklist')
      .select('id')
      .eq('account_id', site.account_id)
      .or(conditions)
      .limit(1);
    if (blocked && blocked.length > 0) return NextResponse.json({ ok: true });
  }

  // Lead-quality flags + score, computed server-side from the owner's filters
  // and what the intake learned. Flags demote; they never reject.
  const filters = siteContent.leadFilters;
  const timeline = text(data, 'timeline', 20);
  const location = text(data, 'location', 120);
  const estimateMin = Math.round(Number(data.get('estimateMin')));
  const estimateMax = Math.round(Number(data.get('estimateMax')));
  const estimate = Number.isFinite(estimateMin) && Number.isFinite(estimateMax) && estimateMin > 0 && estimateMin < estimateMax
    ? { min: estimateMin, max: estimateMax }
    : null;
  const flags: string[] = [];
  if (text(data, 'inArea', 8) === 'false') flags.push('out_of_area');
  if (text(data, 'excluded', 8) === 'true') flags.push('excluded_work');
  if (filters.minJobAmount > 0 && estimate && estimate.max < filters.minJobAmount) flags.push('below_minimum');
  if (timeline === 'researching') flags.push('just_researching');
  if (filters.fullyBooked.enabled) flags.push('while_booked');

  // Phone verification (AI-intake submissions only, and only when the owner
  // enabled it AND texting is configured): the HMAC binds phone+code+expiry,
  // so a valid triple proves the visitor received the code at that number.
  if (filters.phoneVerification && isSmsConfigured() && text(data, 'wizard', 4) === '1') {
    const verified = normalizedPhone !== null && isLeadVerificationValid(
      normalizedPhone,
      text(data, 'verifyCode', 10),
      Number(data.get('verifyExpires')),
      text(data, 'verifyToken', 128),
    );
    if (!verified) {
      return NextResponse.json({ error: 'Phone verification failed — request a new code and try again.' }, { status: 400 });
    }
    flags.push('phone_verified');
  }

  const hasPruneFlag = flags.some((flag) => LEAD_PRUNE_FLAGS.has(flag));
  const triage: LeadTriage = {
    score: hasPruneFlag ? 'low' : normalizedPhone && estimate ? 'hot' : 'warm',
    flags,
    ...(timeline ? { timeline } : {}),
    ...(location ? { location } : {}),
    estimate,
  };

  // Repeat submitter with an open lead? Merge into it instead of stacking a
  // duplicate card on the board.
  if (normalizedPhone || email) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from('leads')
      .select('id, phone, email, message, triage')
      .eq('account_id', site.account_id)
      .in('status', ['new', 'contacted', 'quoted'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(25);
    const duplicate = (recent ?? []).find((lead) =>
      (normalizedPhone && lead.phone && normalizeUsPhone(lead.phone) === normalizedPhone) ||
      (email && lead.email === email));
    if (duplicate) {
      const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const mergedMessage = `${duplicate.message || ''}\n\n— Repeat request (${stamp}): ${message || '(no new details)'}`.trim().slice(0, 6000);
      const existingTriage = getLeadTriage({ triage: duplicate.triage as LeadTriage | null });
      await admin
        .from('leads')
        .update({
          message: mergedMessage,
          triage: { ...existingTriage, flags: [...new Set([...existingTriage.flags, ...flags, 'repeat'])] },
          updated_at: new Date().toISOString(),
        })
        .eq('id', duplicate.id);
      return NextResponse.json({ ok: true, leadId: duplicate.id });
    }
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
      triage,
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