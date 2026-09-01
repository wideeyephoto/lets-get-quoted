'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import { FLEX_PRICE } from '@/lib/pricing';
import { TRADE_CATEGORIES, categoryOf, searchIndexFor } from '@/lib/trade-categories';
import { seasonalTrades } from '@/lib/trade-collections';
import { TRADES, type Trade } from '@/lib/trades';
import styles from './for.module.css';

type VisualKey = 'quote' | 'website' | 'journey' | 'kit';

const FEATURED_SLUGS = ['plumbers', 'hvac', 'roofers', 'electricians', 'landscapers', 'painters'];
const FEATURED_TRADES = FEATURED_SLUGS.map((slug) => TRADES.find((trade) => trade.slug === slug)).filter(
  (trade): trade is Trade => Boolean(trade),
);

const BENEFITS = [
  ['01', 'A website shaped for your trade', 'Start with relevant service pages, trade language, and a layout built around the work customers are looking for.'],
  ['02', 'Intake questions already tuned', 'Capture the photos, urgency, location, and project details that matter before you spend time following up.'],
  ['03', 'Quote templates with a head start', 'Begin with practical scopes and line items, then change every service, price, and detail to match your business.'],
  ['04', 'Your setup, reviewed before launch', 'Nothing is locked in. Edit the wording, services, service area, and pricing before anything becomes customer-facing.'],
] as const;

const FAQS = [
  ['What if my exact trade is not listed?', 'Choose the closest match and tailor it. The starting setup saves time, but it never limits the services, questions, formulas, or language you can use.'],
  ['Can I change the services, questions, and prices?', 'Yes. Every service, intake question, pricing formula, and customer-facing detail can be edited before you publish or send a quote.'],
  ['How customizable are Smart Quotes?', 'Highly customizable. Adjust scopes, line items, photos, options, upgrades, warranties, terms, signatures, and deposit requests so each quote communicates trust and value clearly.'],
  ['What if my company operates across multiple trades?', 'Combine service catalogs, intake flows, quote templates, crews, and customer records for multiple trades inside one account.'],
  ['Does choosing a trade lock me into anything?', 'No. It gives you a more useful starting point. You can change your trade details and setup as your business evolves.'],
  [`How does the ${FLEX_PRICE.monthlyPrice} Flex plan work?`, `Flex has no recurring monthly subscription fee. You pay the ${FLEX_PRICE.platformFee} LGQ platform fee when you collect eligible customer payments, so a month with no collected payments has no base subscription bill.`],
  ['Can I use my own domain?', 'Yes. Connect your existing business domain or start with a Let’s Get Quoted site address while you get everything ready.'],
  ['How do customer deposits reach my bank account?', 'Payments are processed through your connected Stripe account and follow your standard Stripe payout schedule.'],
] as const;

function signupHref(slug: string) {
  return `${APP_SIGNUP_URL}&source=for_trade&trade=${encodeURIComponent(slug)}`;
}

function HeroVisual({ selectedTrade }: { selectedTrade: Trade }) {
  const [activeVisual, setActiveVisual] = useState<VisualKey>('quote');
  const label = selectedTrade.name;

  return (
    <div className={styles.visualExplorer} aria-label={`Preview the ${label} starting setup`}>
      <div className={styles.visualSelector} role="tablist" aria-label="Setup previews">
        {([['quote', 'Smart Quote'], ['website', 'Website'], ['journey', 'Customer journey'], ['kit', 'Setup kit']] as const).map(([key, title], index) => (
          <button key={key} type="button" role="tab" aria-selected={activeVisual === key} className={activeVisual === key ? styles.visualTabActive : undefined} onClick={() => setActiveVisual(key)}>
            <span>0{index + 1}</span>{title}
          </button>
        ))}
      </div>

      <div className={styles.visualFrame}>
        <div className={styles.visualFrameHeader}>
          <span><i aria-hidden="true" />{activeVisual === 'quote' ? 'Customer quote experience' : activeVisual === 'website' ? `${label} website generated` : activeVisual === 'journey' ? 'One connected customer journey' : `${label} starter kit ready`}</span>
          <em><i aria-hidden="true" /> Ready to customize</em>
        </div>
        <div className={styles.visualCanvas}>
          {activeVisual === 'quote' && (
            <div className={styles.quotePreview} role="tabpanel">
              <div className={styles.quoteHeader}><span><small>YOUR BUSINESS</small><b>Smart Quote #1048</b></span><em>Prepared for Maria Rodriguez</em></div>
              <div className={styles.quoteIntro}><span><small>{label.toUpperCase()} PROJECT</small><h3>Choose the right fit for your project.</h3><p>Clear scope, transparent options, and confidence at every price point.</p></span><strong>$3,120<small>recommended</small></strong></div>
              <div className={styles.quoteOptions}>
                <article><small>ESSENTIAL</small><b>$2,480</b><p>Core project scope and standard warranty.</p><span>View details</span></article>
                <article className={styles.quoteRecommended}><i>BEST VALUE</i><small>RECOMMENDED</small><b>$3,120</b><p>Upgraded protection and extended warranty.</p><span>Selected ✓</span></article>
                <article><small>PREMIUM</small><b>$4,060</b><p>Complete upgrade with priority service.</p><span>View details</span></article>
              </div>
              <div className={styles.quoteFooter}><span>✓ Itemized scope&nbsp;&nbsp; ✓ Photos included&nbsp;&nbsp; ✓ Secure deposit</span><b>Approve &amp; pay deposit →</b></div>
            </div>
          )}
          {activeVisual === 'website' && (
            <div className={styles.websitePreview} role="tabpanel">
              <div className={styles.browserBar}><span /><span /><span /><small>yourbusiness.com</small><b>LIVE PREVIEW</b></div>
              <div className={styles.websiteNav}><strong>YOUR BUSINESS</strong><span>Services&nbsp;&nbsp; Work&nbsp;&nbsp; Reviews</span><b>Free estimate</b></div>
              <div className={styles.websiteHero}><small>{label.toUpperCase()} · YOUR SERVICE AREA</small><h3>Work done right.<br />Quoted clearly.</h3><p>A trustworthy starting website with your services, proof, and instant-estimate flow already in place.</p><b>Get an instant estimate →</b><div><span>✓ Licensed &amp; insured</span><span>★ 5-star service</span><span>Fast response</span></div></div>
            </div>
          )}
          {activeVisual === 'journey' && (
            <div className={styles.journeyPreview} role="tabpanel">
              {[
                ['01', 'DISCOVER', 'A customer finds you', 'Trade-specific page'],
                ['02', 'QUALIFY', 'Smart intake adapts', 'Photos + project details'],
                ['03', 'BUILD TRUST', 'Options show value', 'Highly custom quote'],
                ['04', 'WIN THE WORK', 'Approved + paid', '$3,120 · Deposit secured'],
              ].map(([number, kicker, title, copy], index) => (
                <div className={styles.journeyStepWrap} key={number}><article className={index === 3 ? styles.journeyWin : undefined}><span>{number}</span><i>{index === 3 ? '✓' : index + 1}</i><small>{kicker}</small><h3>{title}</h3><p>{copy}</p></article>{index < 3 && <b aria-hidden="true">→</b>}</div>
              ))}
            </div>
          )}
          {activeVisual === 'kit' && (
            <div className={styles.kitPreview} role="tabpanel">
              <div className={styles.kitHeader}><span><small>YOUR INSTANT STARTING POINT</small><h3>{label} business kit</h3></span><b>12 assets ready</b></div>
              <div className={styles.kitGrid}>{[
                ['WEB', 'Website structure', '8 service-ready sections'], ['ASK', 'Smart intake', '9 adaptive questions'], ['EST', 'Estimate flow', '3 project pathways'], ['QT', 'Smart Quotes', 'Good · better · best'], ['SMS', 'Follow-up messages', '5 editable automations'], ['PAY', 'Payment path', 'Deposit + approval'],
              ].map(([code, title, copy]) => <article key={code}><i>{code}</i><span><b>{title}</b><small>{copy}</small></span><em>READY</em></article>)}</div>
              <div className={styles.kitFooter}><span>Every detail stays editable</span><b>Built around the work you do →</b></div>
            </div>
          )}
        </div>
        <div className={styles.visualFrameFooter}><span><b>{label} setup</b><small>Every word, service, question, price, and term remains editable.</small></span><a href={signupHref(selectedTrade.slug)}>Customize my setup →</a></div>
      </div>
    </div>
  );
}

export default function ForExperience() {
  const [selectedTrade, setSelectedTrade] = useState<Trade>(FEATURED_TRADES[0] ?? TRADES[0]);
  const [heroQuery, setHeroQuery] = useState('');
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const directorySearchId = useId();

  const heroMatches = useMemo(() => {
    const query = heroQuery.trim().toLowerCase();
    return query ? TRADES.filter((trade) => searchIndexFor(trade).includes(query)).slice(0, 5) : [];
  }, [heroQuery]);

  const directoryMatches = useMemo(() => {
    const query = directoryQuery.trim().toLowerCase();
    return TRADES.filter((trade) => (!query || searchIndexFor(trade).includes(query)) && (selectedCategory === 'all' || categoryOf(trade.slug)?.id === selectedCategory));
  }, [directoryQuery, selectedCategory]);

  const visibleTrades = showAllTrades || directoryQuery || selectedCategory !== 'all' ? directoryMatches : directoryMatches.slice(0, 4);
  const chooseTrade = (trade: Trade, scroll = false) => {
    setSelectedTrade(trade);
    setHeroQuery(trade.name);
    if (scroll) document.getElementById('start')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className={styles.pageWrapper}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.gridTexture} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span aria-hidden="true" /> PRECONFIGURED FOR {TRADES.length}+ TRADES · ZERO SETUP FEE</p>
            <h1 id="hero-title">Your trade website, estimator, and quotes—<em>ready in minutes.</em></h1>
            <p className={styles.heroDescription}>Choose your trade and get editable services, smart intake questions, and highly customizable Smart Quotes—ready for the work you do.</p>
            <div className={styles.tradeFinder}>
              <label htmlFor="hero-trade-search">What kind of work do you do?</label>
              <div className={styles.finderInputRow}><span aria-hidden="true">⌕</span><input id="hero-trade-search" value={heroQuery} onChange={(event) => setHeroQuery(event.target.value)} placeholder="Try “plumber,” “HVAC,” or “painter”…" autoComplete="off" /><button type="button" onClick={() => heroMatches[0] && chooseTrade(heroMatches[0])}>Find my setup <span>→</span></button></div>
              {heroQuery && heroQuery.toLowerCase() !== selectedTrade.name.toLowerCase() && <div className={styles.heroSuggestions} role="listbox" aria-label="Matching trades">{heroMatches.length ? heroMatches.map((trade) => <button key={trade.slug} type="button" role="option" aria-selected={selectedTrade.slug === trade.slug} onClick={() => chooseTrade(trade)}><span><b>{trade.name}</b><small>{trade.services.slice(0, 3).join(' · ')}</small></span><i>↗</i></button>) : <p>Start with a custom specialty—we’ll tailor it from there.</p>}</div>}
            </div>
            <div className={styles.tradeChips} aria-label="Trade shortcuts">{FEATURED_TRADES.map((trade) => <button type="button" key={trade.slug} onClick={() => chooseTrade(trade)}>{trade.name}</button>)}</div>
            <p className={styles.finePrint}>Type a trade to auto-fill your starting setup · No card required</p>
          </div>
          <HeroVisual selectedTrade={selectedTrade} />
        </div>
      </section>

      <section className={styles.proofStrip} aria-label="Platform proof points"><div><b>{TRADES.length}+ trades</b><span>Preconfigured starting points</span></div><div><b>{FLEX_PRICE.monthlyPrice}</b><span>Start on Flex</span></div><div><b>No card</b><span>Explore before committing</span></div><div><b>Direct Stripe</b><span>Payouts to your account</span></div></section>

      <section className={styles.benefitsSection} aria-labelledby="benefits-title">
        <div className={styles.sectionIntro}><div><p className={styles.sectionKicker}>ONE SETUP. LESS STARTING FROM SCRATCH.</p><h2 id="benefits-title">The useful parts are already shaped around your trade.</h2></div><p>Choose a trade to preload the services, questions, and quote structure you are most likely to need. Then make the setup unmistakably yours.</p></div>
        <div className={styles.benefitGrid}>{BENEFITS.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p><a href={signupHref(selectedTrade.slug)}>Build my setup →</a></article>)}</div>
      </section>

      <section className={styles.smartQuoteSection} aria-labelledby="smart-quotes-title">
        <div className={styles.smartQuoteCopy}><p className={styles.sectionKicker}>HIGHLY CUSTOMIZABLE SMART QUOTES</p><h2 id="smart-quotes-title">Make value easy to see—and your business easy to trust.</h2><p>Present the right scope, choices, proof, and payment path for each customer. Smart Quotes are built to communicate value clearly without forcing every job into the same template.</p><ul><li>Editable scope, line items, photos, and terms</li><li>Good, better, and best options with recommended upgrades</li><li>Warranty, trust signals, e-signature, and deposit choices</li></ul></div>
        <div className={styles.trustQuote}><div><span><small>SMART QUOTE</small><b>{selectedTrade.name} · Prepared for Maria R.</b></span><em>Fully editable</em></div><h3>Choose the right fit for your project</h3><div className={styles.trustOptions}><span><small>ESSENTIAL</small><b>$2,480</b></span><span className={styles.trustRecommended}><i>BEST VALUE</i><small>RECOMMENDED</small><b>$3,120</b></span><span><small>PREMIUM</small><b>$4,060</b></span></div><p>✓ Itemized scope&nbsp;&nbsp; ✓ Warranty included&nbsp;&nbsp; ✓ Secure deposit</p><b className={styles.trustAction}>Approve recommended option →</b></div>
      </section>

      <section className={styles.seasonalSection} aria-labelledby="seasonal-title">
        <div><p className={styles.sectionKicker}>BUILT FOR SEASONAL TRADES</p><h2 id="seasonal-title">Quiet months shouldn’t come with a year-round software bill.</h2><p>Start on Flex at {FLEX_PRICE.monthlyPrice} and pay the platform fee only when you collect eligible customer payments. Upgrade when your volume makes the math work.</p><div className={styles.seasonalLinks}>{seasonalTrades().slice(0, 5).map((trade) => <Link href={`/for/${trade.slug}`} key={trade.slug}>{trade.name}</Link>)}</div><Link className={styles.textLink} href="/pricing">See exact pricing and fees →</Link></div>
        <div className={styles.seasonTimeline} aria-label="Example seasonal business activity"><div><span>QUIET SEASON</span><b>$0 base subscription</b></div><div className={styles.months}>{['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map((month, index) => <span className={index >= 2 && index <= 9 ? styles.activeMonth : undefined} key={month}>{month}<i /></span>)}</div><p><b>Active months</b> Platform fee applies when eligible payments are collected.</p></div>
      </section>

      <section className={styles.directorySection} id="trades-directory" aria-labelledby="directory-title">
        <div className={styles.directoryHeader}><div><p className={styles.sectionKicker}>{TRADES.length}+ TRADES AND COUNTING</p><h2 id="directory-title">Find your trade, then make it yours.</h2><p>Search by trade, specialty, or service. Choose the closest starting point and customize every detail for your business.</p></div><label className={styles.directorySearch} htmlFor={directorySearchId}><span>⌕</span><input id={directorySearchId} type="search" value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} placeholder="Search any trade or service" /></label></div>
        {showAllTrades && <div className={styles.categoryFilters} role="tablist" aria-label="Filter trades by category"><button type="button" role="tab" aria-selected={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')}>All trades</button>{TRADE_CATEGORIES.map((category) => <button type="button" role="tab" aria-selected={selectedCategory === category.id} key={category.id} onClick={() => setSelectedCategory(category.id)}>{category.label}</button>)}</div>}
        <div className={styles.tradeGrid}>{visibleTrades.map((trade, index) => <article className={selectedTrade.slug === trade.slug ? styles.tradeSelected : undefined} key={trade.slug}><button type="button" onClick={() => chooseTrade(trade, true)}><span>{String(index + 1).padStart(2, '0')}</span><h3>{trade.name}</h3><p>{trade.services.slice(0, 3).join(' · ')}</p><b>Build this setup →</b></button><Link href={`/for/${trade.slug}`}>Explore trade page ↗</Link></article>)}</div>
        {!visibleTrades.length && <div className={styles.emptyState}><b>No exact match yet.</b><p>Start with a custom specialty and define the services, questions, and formulas you need.</p><a href={`${APP_SIGNUP_URL}&source=for_trade_custom`}>Start with a custom trade →</a></div>}
        <div className={styles.directoryFooter}><span>{showAllTrades || directoryQuery || selectedCategory !== 'all' ? `Showing ${visibleTrades.length} matching trades` : 'Showing four starting points'}</span>{directoryMatches.length > 4 && !directoryQuery && selectedCategory === 'all' && <button type="button" onClick={() => setShowAllTrades((current) => !current)}>{showAllTrades ? 'Show fewer trades' : 'View every trade'} →</button>}</div>
      </section>

      <section className={styles.multiTradeSection} aria-labelledby="multi-title"><div><p className={styles.sectionKicker}>ONE BUSINESS. EVERY SERVICE LINE.</p><h2 id="multi-title">Run more than one trade? Keep it all connected.</h2><p>Combine service catalogs, intake flows, quote templates, crews, and customer records inside one account.</p></div><div className={styles.multiVisual}><div><span>HVAC</span><span>PLUMBING</span><span>ELECTRICAL</span></div><i>→</i><article><small>ONE LGQ WORKSPACE</small><b>Shared customers, crews &amp; quotes</b><span>Everything stays organized.</span></article></div></section>

      <section className={styles.faqSection} aria-labelledby="faq-title"><div className={styles.faqIntro}><p className={styles.sectionKicker}>CLEAR BEFORE YOU COMMIT</p><h2 id="faq-title">Questions, answered.</h2><p>Trade customization, multiple service lines, pricing, domains, and payouts—without the guesswork.</p><a href={signupHref(selectedTrade.slug)}>Start your free setup →</a></div><div className={styles.faqList}>{FAQS.map(([question, answer], index) => <article key={question}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? null : index)}><span>{question}</span><b>{openFaq === index ? '−' : '+'}</b></button>{openFaq === index && <p>{answer}</p>}</article>)}</div></section>

      <section className={styles.finalSection} id="start" aria-labelledby="final-title"><p className={styles.sectionKicker}>READY WHEN YOU ARE</p><h2 id="final-title">Let’s build the setup that fits your trade.</h2><p>Your {selectedTrade.name.toLowerCase()} starting point is selected. Review it, customize every detail, and publish only when it feels like your business.</p><div><a href={signupHref(selectedTrade.slug)}>Build my {selectedTrade.name} setup →</a><button type="button" onClick={() => document.getElementById('trades-directory')?.scrollIntoView({ behavior: 'smooth' })}>Choose another trade</button></div><small>{FLEX_PRICE.monthlyPrice} to start · No card required · Edit before you publish</small></section>
    </main>
  );
}
