import DemoLeadsScreen from '../DemoLeadsScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lead — demo' };

// The Focus pane's own links point at a lead's page, and in the demo there
// wasn't one — so "Open full lead →", "Send quote" and "Log a call or text →"
// all fell through to /dashboard and dumped a prospect on the login wall.
//
// There is no separate detail page to build: Focus already shows the whole lead,
// so this renders the same screen opened on the lead the URL names. That also
// makes the demo's lead links shareable, which they never were.
//
// It used to import ../page and call it with a prop. That made the sibling
// page's default export take something other than PageProps, which is what
// Next's generated type check rejected — see DemoLeadsScreen.
export default function DemoLeadDetailPage({ params }: { params: { leadId: string } }) {
  return <DemoLeadsScreen initialLeadId={params.leadId} />;
}
