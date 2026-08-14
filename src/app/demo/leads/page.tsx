import DemoLeadsScreen from './DemoLeadsScreen';

export const metadata = { title: 'Leads — Live Demo' };

export const dynamic = 'force-dynamic';

// The screen itself is in DemoLeadsScreen, because /demo/leads/[leadId] renders
// the same one opened on a lead — and a page cannot be imported as a component
// without breaking the PageProps signature Next type-checks it against. The
// reasoning is written out in full there.
export default async function DemoLeadsPage() {
  return <DemoLeadsScreen />;
}
