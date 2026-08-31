import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadBusinessName } from '@/lib/business-name';
import { getSharedFieldPhoneNumber } from '@/lib/sms';
import { displayPhone } from '@/lib/phone';
import { formatFieldVcard } from '@/lib/sms-field-templates';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = createAdminClient();
    let businessName = 'Company';

    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: membership } = await admin
          .from('memberships')
          .select('account_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (membership?.account_id) {
          businessName = await loadBusinessName(admin, membership.account_id);
        }
      }
    } catch {
      // Fallback for environments where server cookies/headers are not active
    }

    const sharedPhoneRaw = (await getSharedFieldPhoneNumber(admin)) || '+12485550199';
    const cleanBusiness = businessName.replace(/[\r\n;,]/g, ' ').trim() || 'Contractor';
    const displayNum = displayPhone(sharedPhoneRaw);

    const vcardContent = formatFieldVcard(cleanBusiness, displayNum);

    const filename = `${cleanBusiness.replace(/[^a-zA-Z0-9_-]/g, '_')}_Field_Line.vcf`;

    return new NextResponse(vcardContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/vcard; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error('Error generating field vCard:', err);
    return new NextResponse('Failed to generate contact card', { status: 500 });
  }
}
