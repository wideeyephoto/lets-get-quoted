import type { Metadata } from 'next';
import { requireCrewContext } from '@/lib/crew-auth';
import { getSharedFieldPhoneNumber } from '@/lib/sms';
import { displayPhone } from '@/lib/phone';
import FieldHeader from '../FieldHeader';
import FieldFooter from '../FieldFooter';
import CrewDictateWorkspace from './CrewDictateWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'End-of-Day Dictation & Voice Log | Field App',
  description: 'Review and manage your dictated voice memos, tasks, and site updates at the end of the day.',
};

export default async function CrewDictatePage() {
  const { accountId: _accountId, crew, businessName, businesses, logoUrl, navLogoTop } = await requireCrewContext();
  const sharedPhoneRaw = await getSharedFieldPhoneNumber();
  const sharedPhoneDisplay = sharedPhoneRaw ? displayPhone(sharedPhoneRaw) : '(248) 555-0199';

  return (
    <>
      <FieldHeader
        businessName={businessName}
        crewName={crew.name}
        backHref="/field"
        switchable={businesses.length > 1}
        logoUrl={logoUrl}
        navLogoTop={navLogoTop}
      />
      <main className="field-main">
        <CrewDictateWorkspace
          crewName={crew.name}
          businessName={businessName}
          fieldPhoneNumber={sharedPhoneDisplay}
          crewPhone={crew.phone}
        />
      </main>
      <FieldFooter navLogoTop={navLogoTop} />
    </>
  );
}
