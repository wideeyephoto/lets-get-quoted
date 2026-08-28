import { type TradeFaqItem } from '@/lib/trade-deep-data';
import styles from './trade-definitive.module.css';

export default function TradeDeepFaq({
  faqs,
  tradeName,
}: {
  faqs: TradeFaqItem[];
  tradeName: string;
}) {
  if (!faqs || faqs.length === 0) return null;

  return (
    <section className={styles.section} id="trade-faq" aria-labelledby="trade-faq-heading">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>Frequently Asked Questions</span>
          <h2 id="trade-faq-heading" className={styles.title}>
            Operational &amp; Pricing FAQ for <em>{tradeName}</em>
          </h2>
          <p className={styles.subtitle}>
            Direct answers on estimating formulas, permits, deposit gating, change orders, and software comparisons.
          </p>
        </div>

        <div className={styles.faqList}>
          {faqs.map((faq, index) => (
            <details key={index} className={styles.faqItem} open={index === 0}>
              <summary className={styles.faqSummary}>{faq.question}</summary>
              <p className={styles.faqAnswer}>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
