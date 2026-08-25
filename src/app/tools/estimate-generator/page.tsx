'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import SiteFooter from '@/components/site-footer';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from '../tools.module.css';

type LineItem = {
  id: string;
  description: string;
  type: string;
  quantity: number;
  unitPrice: number;
};

const INITIAL_ITEMS: LineItem[] = [
  {
    id: '1',
    description: 'Initial Diagnostic & Site Inspection',
    type: 'Labor',
    quantity: 1,
    unitPrice: 125,
  },
  {
    id: '2',
    description: 'Parts & Replacement Materials (Heavy-Duty Spec)',
    type: 'Material',
    quantity: 1,
    unitPrice: 280,
  },
  {
    id: '3',
    description: 'System Installation, Calibration & Safety Test',
    type: 'Labor',
    quantity: 3,
    unitPrice: 95,
  },
];

function formatCurrency(num: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(num);
}

export default function EstimateGeneratorPage() {
  const [contractorName, setContractorName] = useState('Apex Trade Solutions');
  const [contractorPhone, setContractorPhone] = useState('(555) 382-9011');
  const [contractorEmail, setContractorEmail] = useState('service@apextrades.com');
  const [contractorLicense, setContractorLicense] = useState('LIC #948201-A');

  const [clientName, setClientName] = useState('Sarah Jenkins');
  const [clientAddress, setClientAddress] = useState('742 Evergreen Terrace, Austin TX');
  const [estimateNumber, setEstimateNumber] = useState('EST-2026-084');
  const [estimateDate, setEstimateDate] = useState('2026-08-24');

  const [items, setItems] = useState<LineItem[]>(INITIAL_ITEMS);
  const [taxRate, setTaxRate] = useState<number>(8.25);
  const [depositPct, setDepositPct] = useState<number>(30);
  const [terms, setTerms] = useState(
    'Estimate valid for 30 days. 30% deposit required upon authorization to order materials. Workmanship backed by a 1-year guarantee.'
  );

  const [copied, setCopied] = useState(false);

  const addItem = () => {
    const newItem: LineItem = {
      id: String(Date.now()),
      description: 'New Scope Item / Labor',
      type: 'Labor',
      quantity: 1,
      unitPrice: 100,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
      0
    );
    const taxAmount = (subtotal * (Number(taxRate) || 0)) / 100;
    const grandTotal = subtotal + taxAmount;
    const depositDue = (grandTotal * (Number(depositPct) || 0)) / 100;

    return {
      subtotal,
      taxAmount,
      grandTotal,
      depositDue,
    };
  }, [items, taxRate, depositPct]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleCopySummary = () => {
    const textLines = [
      `ESTIMATE: ${estimateNumber}`,
      `From: ${contractorName} (${contractorPhone})`,
      `For: ${clientName} - ${clientAddress}`,
      `Date: ${estimateDate}`,
      `-----------------------------------------`,
      ...items.map(
        (i) => `${i.description} (${i.quantity}x @ ${formatCurrency(i.unitPrice)}) = ${formatCurrency(i.quantity * i.unitPrice)}`
      ),
      `-----------------------------------------`,
      `Subtotal: ${formatCurrency(totals.subtotal)}`,
      `Tax (${taxRate}%): ${formatCurrency(totals.taxAmount)}`,
      `TOTAL: ${formatCurrency(totals.grandTotal)}`,
      `Deposit Required (${depositPct}%): ${formatCurrency(totals.depositDue)}`,
      `\nTerms: ${terms}`,
    ];

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Free Contractor Quote & Estimate Generator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
    description:
      'Free contractor estimate generator tool to build itemized quotes with labor, materials, tax, deposits, and PDF export.',
  };

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main id="main-content">
        <section className={styles.hero}>
          <span className={styles.kicker}>Free Contractor Tool</span>
          <h1 className={styles.headline}>
            Instant Contractor <em>Estimate Generator</em>
          </h1>
          <p className={styles.subhead}>
            Create, itemize, and format professional job estimates on the fly. Print directly to PDF or copy a clean
            text summary to send to your client.
          </p>
        </section>

        <section className={styles.container}>
          <div className={styles.estimateSheet}>
            {/* Top Row: Business Info + Estimate Metadata */}
            <div className={styles.estimateTopRow}>
              <div style={{ flex: 1 }}>
                <h2 className={styles.estimateDocTitle}>ESTIMATE</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  <input
                    type="text"
                    value={contractorName}
                    onChange={(e) => setContractorName(e.target.value)}
                    placeholder="Your Business Name"
                    className={styles.estimateFieldText}
                    style={{ fontWeight: 800, fontSize: 16 }}
                    aria-label="Contractor Name"
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={contractorPhone}
                      onChange={(e) => setContractorPhone(e.target.value)}
                      placeholder="Phone"
                      className={styles.estimateFieldText}
                      aria-label="Phone"
                    />
                    <input
                      type="text"
                      value={contractorEmail}
                      onChange={(e) => setContractorEmail(e.target.value)}
                      placeholder="Email"
                      className={styles.estimateFieldText}
                      aria-label="Email"
                    />
                    <input
                      type="text"
                      value={contractorLicense}
                      onChange={(e) => setContractorLicense(e.target.value)}
                      placeholder="License #"
                      className={styles.estimateFieldText}
                      aria-label="License"
                    />
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 200 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#687e8d', display: 'block' }}>Estimate #</label>
                    <input
                      type="text"
                      value={estimateNumber}
                      onChange={(e) => setEstimateNumber(e.target.value)}
                      className={styles.estimateFieldText}
                      style={{ textAlign: 'right', fontWeight: 700 }}
                      aria-label="Estimate Number"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#687e8d', display: 'block' }}>Date</label>
                    <input
                      type="date"
                      value={estimateDate}
                      onChange={(e) => setEstimateDate(e.target.value)}
                      className={styles.estimateFieldText}
                      style={{ textAlign: 'right' }}
                      aria-label="Estimate Date"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bill To Section */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, marginBottom: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#687e8d' }}>
                Prepared For:
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client / Homeowner Name"
                  className={styles.estimateFieldText}
                  style={{ fontWeight: 700 }}
                  aria-label="Client Name"
                />
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Job / Property Address"
                  className={styles.estimateFieldText}
                  aria-label="Client Address"
                />
              </div>
            </div>

            {/* Itemized Line Items Table */}
            <table className={styles.estimateTable}>
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Description</th>
                  <th style={{ width: '15%' }}>Type</th>
                  <th style={{ width: '12%' }}>Qty</th>
                  <th style={{ width: '13%' }}>Unit Price</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>Total</th>
                  <th style={{ width: '5%' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        className={styles.itemDescInput}
                        aria-label="Item description"
                      />
                    </td>
                    <td>
                      <select
                        value={item.type}
                        onChange={(e) => updateItem(item.id, 'type', e.target.value)}
                        className={styles.itemNumInput}
                        style={{ width: '100%' }}
                        aria-label="Item type"
                      >
                        <option value="Labor">Labor</option>
                        <option value="Material">Material</option>
                        <option value="Equipment">Equipment</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                        className={styles.itemNumInput}
                        aria-label="Item quantity"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, 'unitPrice', Number(e.target.value))}
                        className={styles.itemNumInput}
                        aria-label="Unit price"
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#0c202d' }}>
                      {formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#e74c3c',
                            cursor: 'pointer',
                            fontWeight: 800,
                          }}
                          title="Remove item"
                          aria-label="Remove item"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={styles.actionBtnRow}>
              <button type="button" onClick={addItem} className={styles.addLineBtn}>
                + Add Line Item
              </button>
            </div>

            {/* Totals & Terms */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, marginTop: 24 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 750, color: '#4a5c68', display: 'block', marginBottom: 6 }}>
                  Terms &amp; Notes:
                </label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={4}
                  className={styles.estimateFieldText}
                  style={{ width: '100%', resize: 'vertical' }}
                  aria-label="Scope notes and warranty terms"
                />
              </div>

              <div className={styles.totalsBox} style={{ marginLeft: 'auto' }}>
                <div className={styles.totalLine}>
                  <span>Subtotal:</span>
                  <strong>{formatCurrency(totals.subtotal)}</strong>
                </div>
                <div className={styles.totalLine}>
                  <span>
                    Tax (
                    <input
                      type="number"
                      step="0.1"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      style={{ width: 50, border: '1px solid #c0ced6', borderRadius: 4, padding: '2px 4px' }}
                      aria-label="Tax percentage"
                    />
                    %):
                  </span>
                  <span>{formatCurrency(totals.taxAmount)}</span>
                </div>
                <div className={`${styles.totalLine} ${styles.totalGrand}`}>
                  <span>Total Amount:</span>
                  <span>{formatCurrency(totals.grandTotal)}</span>
                </div>
                <div
                  className={styles.totalLine}
                  style={{ background: '#f0fbf7', padding: '8px 10px', borderRadius: 6, color: '#0d7a5b' }}
                >
                  <span>
                    Deposit Due (
                    <input
                      type="number"
                      value={depositPct}
                      onChange={(e) => setDepositPct(Number(e.target.value))}
                      style={{ width: 45, border: '1px solid #a3e5ce', borderRadius: 4, padding: '2px 4px' }}
                      aria-label="Deposit percentage"
                    />
                    %):
                  </span>
                  <strong>{formatCurrency(totals.depositDue)}</strong>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className={styles.printActions}>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={handlePrint} className={styles.printBtn}>
                  🖨️ Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className={styles.addLineBtn}
                  style={{ background: copied ? '#e0fbf0' : '#f0f4f7' }}
                >
                  {copied ? '✓ Copied to Clipboard!' : '📋 Copy Text Summary'}
                </button>
              </div>

              <div style={{ fontSize: 13, color: '#687e8d' }}>
                Want to text interactive quotes with 1-tap Apple Pay deposits?{' '}
                <Link href={APP_SIGNUP_URL} style={{ color: '#ff6a24', fontWeight: 800 }}>
                  Try Let’s Get Quoted ($0/mo Flex) &rarr;
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
