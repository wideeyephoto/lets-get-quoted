import { type Trade } from '@/lib/trades';
import { getDefinitiveTradeData } from '@/lib/trade-deep-data';
import TradeQuoteShowcase from './TradeQuoteShowcase';
import TradeWorkflowTimeline from './TradeWorkflowTimeline';
import TradeDeepFaq from './TradeDeepFaq';

export default function TradeDefinitiveSuite({ trade }: { trade: Trade }) {
  const data = getDefinitiveTradeData(trade.slug);
  if (!data) return null;

  return (
    <>
      <TradeQuoteShowcase quoteExample={data.quoteExample} tradeName={trade.name} />
      <TradeWorkflowTimeline workflow={data.workflow} tradeName={trade.name} benchmark={data.industryBenchmark} />
      <TradeDeepFaq faqs={data.faqs} tradeName={trade.name} />
    </>
  );
}
