import type { Metadata } from 'next';
import ExampleFrame from '@/components/marketing/example-frame';
import SuiteFeaturePage, {
  Panel,
  PanelActions,
  PanelHead,
  PanelNote,
  PanelRows,
} from '@/components/marketing/suite-feature-page';
import { CASH_WARN_DAYS } from '@/lib/cash-warning';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';

export const metadata: Metadata = {
  title: 'Cash Flow Forecasting for Contractors',
  description:
    'See customer money, payroll and bills before they move. A dated forecast of your balance, so the week you cannot make payroll is a week you find out about in advance.',
  alternates: { canonical: 'https://letsgetquoted.com/features/cash-flow' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/cash-flow',
    siteName: "Let's Get Quoted",
    title: 'Find out about the bad week before it arrives.',
    description:
      'Money already promised and money already owed, dated and projected forward — so a payroll you cannot cover is a warning, not a surprise.',
    images: [{ url: '/features/og-cash-flow.jpg', width: 1200, height: 630, alt: 'Cash flow forecasting for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Find out about the bad week before it arrives.',
    description:
      'Money already promised and money already owed, dated and projected forward — so a payroll you cannot cover is a warning, not a surprise.',
    images: ['/features/og-cash-flow.jpg'],
  },
};

export default function CashFlowFeaturePage() {
  return (
    <SuiteFeaturePage
      eyebrow="Cash flow + insights"
      title={
        <>
          Find out about the bad week <em>before it arrives.</em>
        </>
      }
      lede="Deposits and balances you are owed, payroll and bills you owe — dated and projected forward from today’s balance. The week you cannot cover payroll becomes a warning rather than a Friday morning discovery."
      heroNote="Built from money the product already knows about: approved quotes, deposits, instalments, recurring visits, logged hours and the bills you enter. Nothing here is a guess about your industry."
      secondary={{ label: 'What it can tell you', href: '#capabilities' }}
      demo={
        <ExampleFrame
          label="Two weeks forward, with the day the balance dips below the buffer."
          note="Invented figures. What is real is the method: every line is a dated movement of money, and the balance is those movements applied in order to what you have today."
        >
          <Panel>
            <PanelHead title="Next 14 days · projected" pill="Below buffer Fri" tone="flag" />
            <PanelRows
              rows={[
                { label: 'Today · balance', value: '$14,280' },
                { label: 'Wed · Whitfield balance in', value: '+$5,440' },
                { label: 'Thu · materials, supplier', value: '−$4,120' },
                { label: 'Fri · crew payroll', value: '−$9,860' },
                { label: 'Fri · projected balance', value: '$5,740', strong: true },
              ]}
            />
            <PanelNote>
              A dip is only told to you when it is close enough to act on — inside {CASH_WARN_DAYS}{' '}
              days — and stays quiet otherwise. A warning you have to go looking for is not a
              warning; one that fires every day is not either.
            </PanelNote>
            <PanelActions labels={['Chase the balance', 'Move a bill']} />
          </Panel>
        </ExampleFrame>
      }
      proof={[
        { title: 'Dated, not averaged', body: 'Every line is a day, not a month.' },
        { title: 'Confirmed vs expected', body: 'Money in hand read apart from money promised.' },
        { title: `Warned within ${CASH_WARN_DAYS} days`, body: 'Close enough to actually do something.' },
        { title: 'Clean books at year end', body: 'Cash-basis P&L, expenses, CSV, QuickBooks.' },
      ]}
      story={{
        eyebrow: 'The number that decides whether you take the job',
        title: 'Profitable businesses fail on timing, not on margin.',
        body: 'A job can be worth doing and still be the thing that empties your account, because the materials go out three weeks before the balance comes in. A forecast built from the deposits, instalments and payroll the product already holds turns that from a feeling into a date — and a date is something you can move a bill or chase a balance against.',
      }}
      benefits={[
        {
          title: 'See money before it moves',
          body: 'Deposits and balances you are owed, instalments due, recurring visits ahead, payroll from logged hours and the bills you enter — all dated, all applied forward from what is actually in the account today.',
        },
        {
          title: 'Know how much of it is real',
          body: 'Confirmed money and expected money are separated rather than added together. A forecast that treats a promise like a payment is exactly the forecast that gets somebody into trouble.',
        },
        {
          title: 'Hand your accountant something clean',
          body: 'Cash-basis profit and loss by year, expenses by category, CSV export and a QuickBooks-ready file — built from the same records the work ran on, so nothing has to be reconciled by hand first.',
        },
      ]}
      stepsEyebrow="From records you already have"
      stepsTitle="Four inputs, and three of them are already there."
      steps={[
        {
          title: 'Say what is in the bank',
          body: 'One starting balance and the buffer you never want to go under. Everything else is projected from records the product already holds.',
        },
        {
          title: 'Money in, from the work',
          body: 'Approved deposits, balances due, instalment dates and recurring visits — with a late allowance, because customers are late and a forecast that assumes otherwise is fiction.',
        },
        {
          title: 'Money out, from the crew and the bills',
          body: 'Payroll from hours actually logged, plus materials, equipment, loans, tax and any bill you enter with a date on it.',
        },
        {
          title: 'Read the dip, not the average',
          body: 'The forecast names the day you cross your buffer. It tells you inside a week, and stays quiet the rest of the month.',
        },
      ]}
      catalog={['insights']}
      catalogEyebrow="What it can tell you"
      catalogTitle="The numbers, and the file your accountant wants."
      catalogNote="Built from the same job records the quotes, the crew hours and the payments ran on, which is why none of it needs reconciling before you can trust it."
      faq={[
        {
          q: 'Does this connect to my bank?',
          a: 'No. You tell it what is in the account today, and it projects forward from money the product already knows about — approved quotes, deposits, instalments, recurring visits, logged hours and bills you enter. That means no bank credentials to hand over, and a forecast you can explain line by line.',
        },
        {
          q: 'How does it handle customers who pay late?',
          a: 'With an explicit late allowance rather than by pretending everyone pays on the day. Confirmed money and expected money are also kept apart, so you can read the pessimistic version without doing the arithmetic yourself.',
        },
        {
          q: 'Will it nag me every day?',
          a: `No. A dip is worth telling you about when it is close enough to act on, so the warning fires inside ${CASH_WARN_DAYS} days and stays quiet otherwise. It also goes quiet when the balance you gave it is old enough to be about a different month.`,
        },
        {
          q: 'Is this bookkeeping?',
          a: 'It is a forecast and a set of reports, not a ledger. It will give your accountant a cash-basis P&L, expenses by category and an import-ready QuickBooks CSV — it will not do double-entry bookkeeping or file anything for you.',
        },
        {
          q: 'Does it cost extra?',
          a: `No. There is no subscription and nothing here is a paid tier. The platform fee is ${FEE_TIERS[0].rate} of what a homeowner actually pays you, falling to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your yearly volume grows, plus Stripe's standard processing (${STRIPE_PROCESSING_NOTE}).`,
        },
      ]}
      cta={{
        title: 'Stop finding out about payroll on payroll day.',
        note: `No subscription and no setup fee. The platform fee is ${FEE_TIERS[0].rate} of what you collect and falls to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your volume grows, plus Stripe processing (${STRIPE_PROCESSING_NOTE}).`,
      }}
    />
  );
}
