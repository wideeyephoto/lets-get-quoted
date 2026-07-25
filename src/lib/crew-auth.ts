import { redirect } from 'next/navigation';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCrewByUserId, type CrewMember } from '@/lib/crew';

const TOKEN_EXPIRY_MINUTES = 60;

// Send a crew member a magic link into the mobile field app. Mirrors the owner
// magic-link flow, but routes to /auth/crew-callback (which links the auth user
// to their crew record instead of provisioning a brand-new owner account) and
// lands them on /field.
export async function sendCrewMagicLink(email: string, businessName: string, origin: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email provider is not configured.');
  }

  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !linkData.properties.hashed_token) {
    console.error('Crew magic link generation error:', linkError);
    throw new Error(linkError?.message || 'Failed to generate the sign-in link.');
  }

  const verifyUrl = new URL('/auth/crew-callback', origin);
  verifyUrl.searchParams.set('token_hash', linkData.properties.hashed_token);

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error: emailError } = await resend.emails.send({
    from: "Let's Get Quoted <hello@letsgetquoted.com>",
    to: email,
    subject: `Sign in to the ${businessName} field app`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172033"><p style="color:#b45309;font-weight:700;letter-spacing:0.04em">FIELD APP</p><h2 style="font-size:22px;margin:0 0 12px">Sign in to ${escapeHtml(businessName)}</h2><p style="margin:0 0 18px;line-height:1.5">Tap below to open your jobs, see the schedule, and update work from your phone.</p><p style="margin:0 0 22px"><a href="${verifyUrl.toString()}" style="display:inline-block;padding:12px 22px;background:#172033;color:#fff;text-decoration:none;font-weight:700;border-radius:6px">Open my jobs</a></p><p style="color:#6b7280;font-size:13px;line-height:1.5">Or paste this link into your browser:<br/><span style="word-break:break-all">${verifyUrl.toString()}</span></p><p style="color:#9ca3af;font-size:12px;margin-top:22px">This link expires in ${TOKEN_EXPIRY_MINUTES} minutes. If you didn't expect it, you can ignore this email.</p></div>`,
  });
  if (emailError) {
    console.error('Crew magic link email error:', emailError);
    throw new Error(`Failed to send the sign-in email: ${emailError.message || 'unknown error'}`);
  }
}

// After a crew member verifies their magic link: link the auth user to every
// crew record that carries their email, and give them a 'crew' membership on
// each of those accounts (so RLS lets them read that account's jobs). Returns
// how many crew records matched — 0 means this email isn't on any roster.
export async function linkCrewUserByEmail(userId: string, email: string): Promise<number> {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();

  const { data: crewRows } = await admin
    .from('crew')
    .select('id, account_id, user_id')
    .ilike('email', normalized)
    .is('deleted_at', null)
    .eq('active', true);

  const rows = crewRows ?? [];
  for (const row of rows) {
    if (!row.user_id) {
      await admin.from('crew').update({ user_id: userId }).eq('id', row.id);
    }
    // is_member(account_id) drives RLS for the field views. Never clobber an
    // existing membership (e.g. an owner who's also on a crew): insert-if-absent.
    await admin
      .from('memberships')
      .upsert({ account_id: row.account_id, user_id: userId, role: 'crew' }, { onConflict: 'account_id,user_id', ignoreDuplicates: true });
  }
  return rows.length;
}

export type CrewContext = {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  userId: string;
  accountId: string;
  crew: CrewMember;
  businessName: string;
};

// Guard for field-app pages/actions: requires a logged-in user who is linked to
// an active crew record. Redirects to /field/login otherwise. Uses the session
// (RLS-respecting) client for data reads, resolving identity via admin.
export async function requireCrewContext(): Promise<CrewContext> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/field/login');

  const admin = createAdminClient();
  const crew = await getCrewByUserId(admin, user.id);
  if (!crew) redirect('/field/login?error=not-crew');

  // Resolve branding via the admin client: crew RLS no longer grants read on the
  // accounts/sites tables (they hold billing + website config), so the field app
  // gets the business name here instead of reading those tables with the session
  // client. business_name/company_name aren't sensitive.
  const [{ data: site }, { data: account }] = await Promise.all([
    // limit(1): a stray duplicate sites row must not hard-fail every field page
    // (maybeSingle throws on >1) now that this read is on the crew-critical path.
    admin.from('sites').select('company_name').eq('account_id', crew.account_id).limit(1).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', crew.account_id).maybeSingle(),
  ]);
  const businessName = site?.company_name || account?.business_name || 'My crew';

  return { supabase, userId: user.id, accountId: crew.account_id, crew, businessName };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
}
