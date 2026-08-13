import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { HONEYPOT_FIELD } from '@/components/honeypot-field';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendLeadNotificationEmail } from '@/lib/email';
import { classifyEmail } from '@/lib/email-quality';
import { createLead, getLeadTriage, LEAD_PRUNE_FLAGS, type Lead, type LeadTriage } from '@/lib/leads';
import { deleteLeadPhotos, uploadLeadPhoto } from '@/lib/lead-photo-storage';
import { isLeadVerificationConfigured, isLeadVerificationValid } from '@/lib/lead-verification';
import { normalizeUsPhone } from '@/lib/phone';
import { getSiteContent, isFullyBookedActive } from '@/lib/site-content';
import { isSmsConfigured, sendOwnerHighValueLeadSms } from '@/lib/sms';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Structural validation lives in email-quality.ts now. The regex this replaced
// accepted "a@b.c" and "a..b@c.com" — undeliverable strings that went straight
// into the send list and bounced, which is what costs sending reputation.

function text(data: FormData, key: string, maxLength: number) {
  return String(data.get(key) ?? '').trim().slice(0, maxLength);
}

type LeadAlertOptions = { highValue: boolean; muteLow: boolean; smsEnabled: boolean; alertPhone: string | null };

// Best-effort owner alert for a new or repeat lead — never throws. Escalates
// high-value leads (louder email + optional urgent owner SMS) and, when muting
// is on, stays silent for low-quality ones (they still land on the board).
async function notifyOwner(
  admin: SupabaseClient,
  site: { account_id: string; company_name: string },
  lead: Lead,
  request: NextRequest,
  alert: LeadAlertOptions,
) {
  try {
    // Don't interrupt for low-quality leads when muting is on — no email, no
    // text; the lead is still captured and visible in the board.
    if (alert.muteLow && lead.triage?.score === 'low') return;

    const estimate = lead.triage?.estimate ?? null;
    const dashboardUrl = `${request.nextUrl.origin}/dashboard/leads/${lead.id}`;

    const { data: owner } = await admin.from('memberships').select('user_id').eq('account_id', site.account_id).eq('role', 'owner').limit(1).maybeSingle();
    if (owner?.user_id) {
      const { data: ownerUser } = await admin.auth.admin.getUserById(owner.user_id);
      if (ownerUser.user?.email) {
        await sendLeadNotificationEmail({
          recipientEmail: ownerUser.user.email,
          businessName: site.company_name,
          lead,
          dashboardUrl,
          highValue: alert.highValue,
          estimate,
        });
      }
    }

    // Urgent text to the owner's own mobile — high-value leads only, opt-in.
    if (alert.highValue && alert.smsEnabled && alert.alertPhone) {
      await sendOwnerHighValueLeadSms({
        // Needed for the opt-out check inside: consent rows are keyed
        // (account_id, phone_number), so there is no way to ask whether this
        // owner has replied STOP without knowing whose account it is.
        accountId: site.account_id,
        alertPhone: alert.alertPhone,
        businessName: site.company_name,
        leadName: lead.name ?? '',
        estimate,
        dashboardUrl,
      });
    }
  } catch (error) {
    console.error('Lead notification failed:', error);
  }
}

export async function POST(request: NextRequest) {
  const data = await request.formData();
  // Honeypot — see src/components/honeypot-field.tsx for why the name is what
  // it is. The legacy 'company' field is deliberately IGNORED: autofill and
  // password managers fill anything called "company", so checking it silently
  // dropped real visitors as "bots", and stale cached pages still post it.
  if (text(data, HONEYPOT_FIELD, 100)) return NextResponse.json({ ok: true });
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
  // What the work IS. Both forms mark this required, but `required` is a browser
  // courtesy that any direct POST skips — and until now nothing here checked,
  // so a lead could arrive as a name, a number and an address for a job nobody
  // had described. That is a callback just to find out what someone wants,
  // which is the phone tag this form exists to remove.
  if (!message) {
    return NextResponse.json({ error: 'Tell us what you need done so we can help.' }, { status: 400 });
  }
  if (phone && !normalizeUsPhone(phone)) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }
  // Refused only when the string CANNOT deliver. A junk-but-deliverable address
  // (test@test.com, a burner inbox) is kept and flagged below — losing a real
  // inquiry over a typed-in filler address is the worse trade, and the phone
  // number is usually how this work gets won anyway.
  const emailVerdict = classifyEmail(email);
  if (email && !emailVerdict.valid) {
    return NextResponse.json({ error: emailVerdict.note ?? 'Enter a valid email address.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Durable per-IP cap on lead creation (photos + owner email/SMS + DB writes).
  const ip = clientIpFrom(request.headers);
  if (!(await checkRateLimit(admin, `lead:ip:${ip}`, 20, 60))) {
    return NextResponse.json({ error: 'Too many requests — please wait a minute and try again.' }, { status: 429 });
  }

  const { data: site } = await admin
    .from('sites')
    .select('id, account_id, company_name, subdomain, custom_domain, published, content')
    .eq('id', siteId)
    .eq('published', true)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: 'This website is not accepting requests.' }, { status: 404 });

  const siteContent = getSiteContent(site.content);
  // Account-level intake tuning: the high-value threshold + how alerts behave.
  // Defensive reads so a pre-migration DB degrades to sensible defaults.
  const { data: accountSettings } = await admin
    .from('accounts')
    .select('high_value_lead_amount, mute_low_quality_leads, high_value_sms_enabled, alert_phone')
    .eq('id', site.account_id)
    .maybeSingle();
  const highValueThreshold = Number(accountSettings?.high_value_lead_amount) || 0;
  const muteLow = accountSettings?.mute_low_quality_leads !== false; // default: mute
  const smsEnabled = Boolean(accountSettings?.high_value_sms_enabled);
  const alertPhone = (accountSettings?.alert_phone as string | null) || null;

  const quoteForm = siteContent.quoteForm;
  // Two forms, two email settings, and they are NOT interchangeable. The classic
  // quote form is governed by quoteForm.emailRequired ("Require email on quote
  // form"); the Instant Estimate wizard has its own off/optional/required
  // control, which is the one printed next to the field the visitor is looking
  // at. Enforcing the classic setting on a wizard submission rejected people who
  // had just been told the field was optional — the form said one thing and the
  // server said another, and the visitor was the one who lost.
  const fromWizard = text(data, 'wizard', 4) === '1';
  const emailIsRequired = fromWizard
    ? siteContent.estimateRanges.emailField === 'required'
    : quoteForm.emailRequired;
  if (emailIsRequired && !email) {
    return NextResponse.json({ error: 'Add your email address so the contractor can follow up.' }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ error: 'Add a valid phone number or email so the contractor can follow up.' }, { status: 400 });
  }

  const normalizedPhone = phone ? normalizeUsPhone(phone) : null;

  // Blocked contacts are silently dropped — the visitor sees success, the
  // owner's inbox stays clean, and the blocked party learns nothing.
  if (normalizedPhone || email) {
    // Separate equality queries instead of a string-built .or() — a crafted
    // "email" (the regex permits commas) could otherwise inject extra PostgREST
    // conditions and, by erroring the query, make the blocklist check fail OPEN.
    const blockChecks: PromiseLike<boolean>[] = [];
    if (normalizedPhone) {
      blockChecks.push(
        admin.from('lead_blocklist').select('id').eq('account_id', site.account_id).eq('phone', normalizedPhone).limit(1).then(({ data }) => Boolean(data && data.length)),
      );
    }
    if (email) {
      blockChecks.push(
        admin.from('lead_blocklist').select('id').eq('account_id', site.account_id).eq('email', email).limit(1).then(({ data }) => Boolean(data && data.length)),
      );
    }
    const results = await Promise.all(blockChecks);
    if (results.some(Boolean)) return NextResponse.json({ ok: true });
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
  // Deliverable-looking but not worth mailing. NOT a prune flag — it says
  // nothing about whether the job is real, only that the address isn't. It
  // keeps the address out of every automated send, which is the whole point:
  // one dead address isn't one bounce, it's a bounce on the quote, the invoice,
  // the reminder, the review ask and every campaign after it.
  if (emailVerdict.junk) flags.push('junk_email');
  if (filters.minJobAmount > 0 && estimate && estimate.max < filters.minJobAmount) flags.push('below_minimum');
  if (timeline === 'researching') flags.push('just_researching');
  if (isFullyBookedActive(filters)) flags.push('while_booked');

  // Phone verification (AI-intake submissions only, and only when the owner
  // enabled it): the HMAC binds phone+code+expiry, so a valid triple proves the
  // visitor received the code at that number.
  //
  // The owner asked for this check and it either ran or it didn't. It used to
  // be gated on isSmsConfigured() alone, so a deployment with no texting — or
  // mid-way through a provider migration — skipped the whole block and the lead
  // arrived looking exactly like one that had never needed verifying. "We could
  // not check" must never render identically to "we checked": the lead still
  // goes through, because rejecting real customers over our own configuration
  // is worse, but it is flagged as unchecked rather than silently unflagged.
  if (filters.phoneVerification && text(data, 'wizard', 4) === '1') {
    if (!isSmsConfigured() || !isLeadVerificationConfigured()) {
      console.error('Phone verification is enabled but unavailable — no SMS provider or no verification secret.');
      flags.push('phone_verification_unavailable');
    } else {
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
  }

  const hasPruneFlag = flags.some((flag) => LEAD_PRUNE_FLAGS.has(flag));
  // High-value = the cream of "hot": not pruned, and the AI estimate could reach
  // the owner's threshold. It rides on the existing hot/warm/low score (never a
  // parallel tier) and drives escalated alerts.
  const isHighValue = !hasPruneFlag && estimate != null && highValueThreshold > 0 && estimate.max >= highValueThreshold;
  if (isHighValue) flags.push('high_value');
  const triage: LeadTriage = {
    score: hasPruneFlag ? 'low' : isHighValue || (normalizedPhone && estimate) ? 'hot' : 'warm',
    flags,
    ...(timeline ? { timeline } : {}),
    ...(location ? { location } : {}),
    estimate,
    contactPreference: text(data, 'contactPreference', 10) === 'text' ? 'text_only' : 'any',
  };

  // Repeat submitter with an open lead? Merge into it instead of stacking a
  // duplicate card on the board.
  if (normalizedPhone || email) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from('leads')
      .select('*')
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
      // A repeat request signals intent: unsnooze the lead so it resurfaces.
      const mergedTriage = { ...existingTriage, flags: [...new Set([...existingTriage.flags, ...flags, 'repeat'])], snoozedUntil: null };
      await admin
        .from('leads')
        .update({
          message: mergedMessage,
          triage: mergedTriage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', duplicate.id);
      // Still notify the owner — a homeowner asking twice is hotter, not spam,
      // so this bypasses the low-quality mute.
      await notifyOwner(admin, site, { ...(duplicate as Lead), message: mergedMessage, triage: mergedTriage }, request, {
        highValue: mergedTriage.flags.includes('high_value'),
        muteLow: false,
        smsEnabled,
        alertPhone,
      });
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

    await notifyOwner(admin, site, lead, request, { highValue: isHighValue, muteLow, smsEnabled, alertPhone });

    return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
  } catch (error) {
    await deleteLeadPhotos(site.account_id, photoPaths);
    console.error('Public lead intake failed:', error);
    return NextResponse.json({ error: 'Unable to send your request right now.' }, { status: 500 });
  }
}