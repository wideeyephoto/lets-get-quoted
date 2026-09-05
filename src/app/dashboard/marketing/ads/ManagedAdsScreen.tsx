'use client';

import { useState, useMemo, useEffect } from 'react';
import MarketingNav from '../MarketingNav';
import {
  calculateAdProjections,
  generateTradeKeywords,
  generateResponsiveSearchAd,
  generateGoogleAdsEditorCsv,
  generateSeasonalAdCopy,
  checkCampaignCapacityGuard,
  TRADE_BENCHMARKS,
  type SeasonalAdAngle,
  type AdDayOfWeek,
} from '@/lib/google-ads-generator';
import { AD_PLATFORM_FEE_RATE, MANAGED_ADS_CHECKOUT_ENABLED, type AdBudgetWalletState } from '@/lib/ad-billing-shared';
import {
  SMART_BUNDLES,
  getSmartBundle,
  generateMetaAdCopy,
  generateRetargetingAdCopy,
  type SmartBundleId,
} from '@/lib/multi-channel-ads';
import { detectWeatherSurgeOpportunity } from '@/lib/weather-ad-surge';
import { analyzeCustomAdFocus } from '@/lib/ad-custom-focus-ai';
import CityAutocomplete from '@/components/city-autocomplete';
import {
  sendOwnerPhoneVerificationCodeAction,
  verifyOwnerPhoneVerificationCodeAction,
} from '@/app/dashboard/messages/actions';
import { predictAdWalletDepletion } from '@/lib/ad-wallet-predictor';
import { matchTradeFamilies, type TradeFamily } from '@/lib/property-intel/profile';
import { resolveTradeDemandPosture } from '@/lib/pricing-intelligence';
import styles from './ManagedAdsScreen.module.css';

type Props = {
  businessName: string;
  trade: string;
  tradeSlug: string;
  city: string;
  domain: string;
  phone: string;
  availableServices: string[];
  initialWalletState?: AdBudgetWalletState;
  leadFilters?: Record<string, unknown>;
  basePath?: string;
  initialTab?: string;
};

const COMPARISON_ROWS = [
  {
    metric: 'Billing Structure & Cash Flow',
    agency: '$2,000 – $3,500 / mo up-front retainer',
    lgq: '💧 Weekly Drip Funding ($168 – $588 / week)',
  },
  {
    metric: 'Direct Ad Click Spend',
    agency: 'Only 30%–50% reaches Google clicks',
    lgq: '100% of nominal ad allocation applied to clicks',
  },
  {
    metric: 'Contract Lock-In',
    agency: '6 to 12 Month Mandatory Contract',
    lgq: 'Zero Contracts · Cancel or Pause Anytime',
  },
  {
    metric: 'Lead Response Time',
    agency: 'Manual contractor callbacks (hours/days later)',
    lgq: '⚡ Sub-60s AI Auto-SMS (12s average)',
  },
  {
    metric: 'Offline Revenue Optimization',
    agency: 'Disconnected vanity clicks & impressions',
    lgq: 'Signed Quote $$$ synced back to Google AI',
  },
  {
    metric: 'Automatic Budget Safeguards',
    agency: 'None (ad spend burns while you are booked)',
    lgq: 'Weather Surge Boost & Capacity Auto-Pause',
  },
  {
    metric: 'Time to Go Live',
    agency: '3 to 5 Weeks of onboarding meetings',
    lgq: '1-Click Launch (Live within 24h)',
  },
];

const FAQS = [
  {
    q: 'Why do you use Weekly Drip Billing instead of a monthly invoice?',
    a: 'Weekly drip billing lowers your initial out-of-pocket cash commitment by over 75% (starting at $168 to get live) without starving your campaign momentum. We deploy your ad spend into Google & Meta daily, but bill your card once every 7 days so you avoid dozens of separate daily credit card transactions.',
  },
  {
    q: 'How is this different from hiring a local marketing agency?',
    a: 'Traditional marketing agencies charge $2,000 to $3,500/month in fixed retainer fees, keep 40%–60% of your ad spend as hidden markups, and lock you into 6-to-12-month contracts. With Let’s Get Quoted, your ad allocation goes straight to Google and Meta clicks for a transparent weekly platform fee with zero long-term commitments.',
  },
  {
    q: 'Do I need my own Google Ads or Meta Ads manager account?',
    a: 'No. Everything is fully provisioned and managed under our Master Google Ads MCC and Meta Business Manager architecture. You never have to navigate complex ad managers, configure tracking scripts, or deal with billing reconciliations.',
  },
  {
    q: 'How does the Auto-Refill Advertising Wallet option work?',
    a: 'The Auto-Refill Wallet starts with a smaller initial deposit today (e.g. $250). As your ads run on Google and Meta, clicks are deducted from your balance. Whenever your balance drops below $75, the wallet automatically triggers a $250 top-up so your campaigns stay live without interruption. You set a hard MAX Monthly Spend limit (e.g. $1,000/mo) so you are 100% guaranteed to never be charged more than your approved monthly ceiling.',
  },
  {
    q: 'How fast will my campaigns go live after subscribing?',
    a: 'Campaigns are provisioned programmatically within 24 business hours. Geo-fencing around your target city, high-intent buyer keywords, character-compliant ad copy, sitelink extensions, and call tracking are automatically deployed.',
  },
  {
    q: 'What happens when our crews are booked solid with jobs?',
    a: 'Our built-in Capacity Guard monitors your dispatch calendar. The moment you toggle your site or schedule to "Fully Booked", Google & Meta bidding automatically pauses so you never waste dollars on leads you cannot service.',
  },
  {
    q: 'Can I cancel, pause, or upgrade my subscription anytime?',
    a: 'Yes, 100%. There are zero cancellation fees or long-term contracts. You can upgrade, downgrade, pause, or cancel anytime with one click directly in your Stripe Customer Portal.',
  },
  {
    q: 'How are leads delivered to me and my team?',
    a: 'Incoming leads trigger instant SMS text notifications and mobile push alerts to your phone. They are immediately logged into your Let’s Get Quoted Leads Inbox with full attribution (exact search keyword, campaign channel, and landing page variant).',
  },
  {
    q: 'What is 60-Second Speed-to-Lead Auto-SMS?',
    a: 'When an ad visitor submits a quote request, our AI sends a personalized, trade-specific SMS within 60 seconds (typically under 15 seconds) to qualify the homeowner and book an appointment slot on your schedule before competitors pick up the phone.',
  },
  {
    q: 'Can I customize which services or cities are targeted?',
    a: 'Yes. In the Advanced Options drawer, you can adjust your service radius (10–60 miles), modify your target city, and toggle specific high-margin services on or off at any time.',
  },
];

const DAY_LABELS: { key: AdDayOfWeek; short: string; label: string }[] = [
  { key: 'MONDAY', short: 'Mon', label: 'Monday' },
  { key: 'TUESDAY', short: 'Tue', label: 'Tuesday' },
  { key: 'WEDNESDAY', short: 'Wed', label: 'Wednesday' },
  { key: 'THURSDAY', short: 'Thu', label: 'Thursday' },
  { key: 'FRIDAY', short: 'Fri', label: 'Friday' },
  { key: 'SATURDAY', short: 'Sat', label: 'Saturday' },
  { key: 'SUNDAY', short: 'Sun', label: 'Sunday' },
];

function formatHourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12:00 AM (Midnight)';
  if (hour === 12) return '12:00 PM (Noon)';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

export default function ManagedAdsScreen({
  businessName,
  trade,
  tradeSlug,
  city: initialCity,
  domain,
  phone: initialPhone,
  availableServices,
  initialWalletState,
  leadFilters,
  basePath = '/dashboard',
  initialTab,
}: Props) {
  // Step 1: Selected Smart Bundle & Funding Model
  const [fundingModel, setFundingModel] = useState<'weekly_drip' | 'auto_refill_wallet'>('weekly_drip');
  const [selectedBundleId, setSelectedBundleId] = useState<SmartBundleId>('growth');
  const [city, setCity] = useState<string>(initialCity || 'Local Area');
  const [phone] = useState<string>(initialPhone || '');
  const [previewPlatform, setPreviewPlatform] = useState<
    'mobile' | 'desktop' | 'meta' | 'retargeting' | 'sms' | 'keywords'
  >('mobile');
  const isManagementTab =
    initialTab === 'overview' ||
    initialTab === 'targeting' ||
    initialTab === 'creative' ||
    initialTab === 'billing' ||
    initialTab === 'halo';
  const [managementTab, setManagementTab] = useState<'overview' | 'targeting' | 'creative' | 'billing' | 'halo'>(
    isManagementTab ? initialTab : 'overview'
  );
  const [showManagementConsole, setShowManagementConsole] = useState<boolean>(
    Boolean(isManagementTab || initialWalletState?.status === 'active' || initialWalletState?.status === 'paused')
  );

  useEffect(() => {
    if (
      initialTab === 'overview' ||
      initialTab === 'targeting' ||
      initialTab === 'creative' ||
      initialTab === 'billing' ||
      initialTab === 'halo'
    ) {
      setManagementTab(initialTab);
      setShowManagementConsole(true);
    }
  }, [initialTab]);
  const [currentStatus, setCurrentStatus] = useState<string>(initialWalletState?.status || 'inactive');
  const [isCancelScheduled, setIsCancelScheduled] = useState<boolean>(Boolean(initialWalletState?.cancelAtPeriodEnd));
  const [actionLoading, setActionLoading] = useState<'pause' | 'resume' | 'cancel' | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState<boolean>(initialWalletState?.smsAlertsEnabled !== false);
  const [smsAlertPhone, setSmsAlertPhone] = useState<string>(initialWalletState?.smsAlertPhone || initialPhone || '');
  const [updatingSms, setUpdatingSms] = useState<boolean>(false);
  const [showWeeklyCostDetails, setShowWeeklyCostDetails] = useState<boolean>(false);

  // 2FA Phone Verification State for SMS Billing Alerts
  const initialVerifiedPhone = useMemo(() => {
    return initialWalletState?.smsAlertPhone || initialPhone || '';
  }, [initialWalletState?.smsAlertPhone, initialPhone]);

  const [sms2faStatus, setSms2faStatus] = useState<'idle' | 'sending' | 'sent' | 'verified'>(
    initialVerifiedPhone ? 'verified' : 'idle'
  );
  const [sms2faToken, setSms2faToken] = useState<{ token: string; expiresAt: number; phone: string } | null>(null);
  const [sms2faCode, setSms2faCode] = useState<string>('');
  const [sms2faError, setSms2faError] = useState<string | null>(null);
  const [sms2faCountdown, setSms2faCountdown] = useState<number>(0);
  const [verifying2fa, setVerifying2fa] = useState<boolean>(false);

  useEffect(() => {
    if (sms2faCountdown <= 0) return;
    const timer = setInterval(() => setSms2faCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [sms2faCountdown]);

  const isPhoneVerified =
    sms2faStatus === 'verified' ||
    (Boolean(initialVerifiedPhone) && smsAlertPhone.trim() === initialVerifiedPhone);

  const handleSend2faCode = async () => {
    if (!smsAlertPhone.trim()) return;
    setSms2faStatus('sending');
    setSms2faError(null);
    try {
      const res = await sendOwnerPhoneVerificationCodeAction(smsAlertPhone.trim());
      if (res.status === 'sent') {
        setSms2faToken({ token: res.token, expiresAt: res.expiresAt, phone: res.phone });
        setSms2faStatus('sent');
        setSms2faCountdown(60);
      } else {
        setSms2faStatus('idle');
        setSms2faError(res.message);
      }
    } catch {
      setSms2faStatus('idle');
      setSms2faError('Failed to send verification text. Check your number.');
    }
  };

  const handleVerify2faCode = async (overrideCode?: string) => {
    const codeToVerify = (overrideCode || sms2faCode).trim().replace(/\D/g, '');
    if (!sms2faToken || codeToVerify.length !== 6) return;
    setVerifying2fa(true);
    setSms2faError(null);
    try {
      const res = await verifyOwnerPhoneVerificationCodeAction(
        smsAlertPhone.trim(),
        codeToVerify,
        sms2faToken.token,
        sms2faToken.expiresAt
      );
      if (res.status === 'verified') {
        setSms2faStatus('verified');
        setSms2faCode('');
      } else {
        setSms2faError(res.message);
      }
    } catch {
      setSms2faError('Failed to verify code.');
    } finally {
      setVerifying2fa(false);
    }
  };

  // Custom Specific Campaign Focus / Promotion (AI Smart Field)
  const [customFocus, setCustomFocus] = useState<string>('');
  const customFocusAnalysis = useMemo(
    () => analyzeCustomAdFocus({ customFocus, trade, city, businessName }),
    [customFocus, trade, city, businessName]
  );

  // Segmented Cockpit Configuration Tab State (Step 1, 2, 3)
  const [configTab, setConfigTab] = useState<'plan' | 'schedule' | 'focus_roi'>('plan');

  // Compartmentalized Knowledge Hub Tab State
  const [knowledgeTab, setKnowledgeTab] = useState<'pipeline' | 'comparison' | 'lsa_dual' | 'timeline' | 'shields' | 'faq'>('pipeline');

  // Collapsible Strategy Briefing State
  const [showAiBriefing, setShowAiBriefing] = useState<boolean>(false);

  // Auto-Refill Advertising Wallet Configuration
  const [walletDepositDollars, setWalletDepositDollars] = useState<number>(250);
  const [walletRefillThresholdDollars, setWalletRefillThresholdDollars] = useState<number>(75);
  const [walletRefillAmountDollars, setWalletRefillAmountDollars] = useState<number>(250);
  const [walletMaxMonthlySpendDollars, setWalletMaxMonthlySpendDollars] = useState<number>(1000);

  // Seasonal Demand Posture & Pricing Guidance Intelligence
  const tradeFamily = useMemo(() => {
    const families = matchTradeFamilies(tradeSlug || trade);
    return (families[0] || 'general') as TradeFamily;
  }, [tradeSlug, trade]);

  const seasonalDemand = useMemo(() => {
    const currentMonthIndex = new Date().getMonth();
    return resolveTradeDemandPosture(tradeFamily, currentMonthIndex);
  }, [tradeFamily]);

  // Campaign Dayparting & Schedule State (Step 2)
  const [selectedDays, setSelectedDays] = useState<AdDayOfWeek[]>([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ]);
  const [startHour, setStartHour] = useState<number>(7); // 7:00 AM
  const [endHour, setEndHour] = useState<number>(18); // 6:00 PM
  const [allHours, setAllHours] = useState<boolean>(false);

  const toggleDay = (day: AdDayOfWeek) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev; // Keep at least 1 active day
        return prev.filter((d) => d !== day);
      }
      return [...prev, day];
    });
  };

  const _selectOnlyDay = (day: AdDayOfWeek) => {
    setSelectedDays([day]);
  };

  const selectWeekdays = () => {
    setSelectedDays(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']);
  };

  const selectAllDays = () => {
    setSelectedDays(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
  };

  // Advanced overrides
  const [radius, setRadius] = useState<number>(25);
  const [selectedServices, setSelectedServices] = useState<string[]>(
    availableServices.length > 0 ? availableServices.slice(0, 6) : [trade || 'Contractor Services']
  );

  // ROI Calculator State
  const defaultBenchmark = useMemo(() => {
    const norm = (tradeSlug || trade || '').toLowerCase();
    return (
      TRADE_BENCHMARKS[norm] ||
      Object.values(TRADE_BENCHMARKS).find((b) => norm.includes(b.trade.toLowerCase())) ||
      TRADE_BENCHMARKS.general
    );
  }, [tradeSlug, trade]);

  const [avgTicketDollars, setAvgTicketDollars] = useState<number>(defaultBenchmark.typicalJobValue);
  const [closeRatePct, setCloseRatePct] = useState<number>(20);
  const [weatherSurgeSim, setWeatherSurgeSim] = useState<boolean>(false);

  // Update default ticket if trade benchmark changes
  useEffect(() => {
    setAvgTicketDollars(defaultBenchmark.typicalJobValue);
  }, [defaultBenchmark]);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [downloadedCsv, setDownloadedCsv] = useState(false);
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const currentBundle = useMemo(() => getSmartBundle(selectedBundleId), [selectedBundleId]);

  // Wallet Fee & Deposit Calculations
  const walletFeeDollars = Math.round(walletDepositDollars * AD_PLATFORM_FEE_RATE);
  const walletTotalDepositDollars = walletDepositDollars + walletFeeDollars;

  // Schedule & Pacing Calculations
  const activeDaysCount = selectedDays.length;
  const dailyHoursCount = allHours ? 24 : Math.max(1, endHour - startHour);
  const totalWeeklyHours = activeDaysCount * dailyHoursCount;
  const activeDaysPaceDaily = useMemo(() => {
    if (fundingModel === 'auto_refill_wallet') {
      const estimatedWeeklyBudget = Math.round((walletMaxMonthlySpendDollars / 4.33) * 100) / 100;
      return Math.round((estimatedWeeklyBudget / Math.max(1, activeDaysCount)) * 100) / 100;
    }
    return Math.round((currentBundle.weeklyAdSpendDollars / Math.max(1, activeDaysCount)) * 100) / 100;
  }, [fundingModel, walletMaxMonthlySpendDollars, currentBundle.weeklyAdSpendDollars, activeDaysCount]);

  // Calculated Ad Wallet Burn & Runway Depletion Analysis
  const walletBurn = useMemo(() => {
    const currentBalance =
      initialWalletState?.walletBalanceCents !== undefined
        ? initialWalletState.walletBalanceCents / 100
        : fundingModel === 'auto_refill_wallet'
          ? walletDepositDollars
          : 250;

    const recentSpend =
      initialWalletState?.dailySpendHistory && initialWalletState.dailySpendHistory.length > 0
        ? initialWalletState.dailySpendHistory.map((d) => d.spendCents / 100)
        : [activeDaysPaceDaily || 35];

    return predictAdWalletDepletion({
      accountId: initialWalletState?.googleCampaignId || 'current_account',
      currentBalanceDollars: currentBalance,
      recentDailySpend: recentSpend,
      autoRefillAmountDollars: initialWalletState?.refillAmountCents
        ? initialWalletState.refillAmountCents / 100
        : walletRefillAmountDollars,
    });
  }, [initialWalletState, fundingModel, walletDepositDollars, activeDaysPaceDaily, walletRefillAmountDollars]);

  // Projections for Google Search
  const _projections = useMemo(
    () => calculateAdProjections(currentBundle.searchSpendDollars, tradeSlug || trade),
    [currentBundle.searchSpendDollars, tradeSlug, trade]
  );

  // Weather Surge Opportunity Detection
  const weatherSurge = useMemo(() => {
    return detectWeatherSurgeOpportunity(trade, city, {
      hasStorm: weatherSurgeSim,
      hasHighWind: weatherSurgeSim,
      temperatureF: weatherSurgeSim ? 92 : 78,
      alertHeadline: weatherSurgeSim ? 'Severe Storm & High Demand Watch' : undefined,
    });
  }, [trade, city, weatherSurgeSim]);

  // Capacity Auto-Pause Check
  const capacityGuard = useMemo(() => checkCampaignCapacityGuard(leadFilters), [leadFilters]);

  // Keywords
  const { allKeywords, negativeKeywords } = useMemo(() => {
    const base = generateTradeKeywords(selectedServices, city, trade, ['Rival Home Services', 'Mega Pro Services']);
    if (customFocusAnalysis.isCustom && customFocusAnalysis.targetBuyerSearches.length > 0) {
      return {
        allKeywords: [...customFocusAnalysis.targetBuyerSearches, ...base.allKeywords],
        negativeKeywords: [...customFocusAnalysis.customNegativeFilters, ...base.negativeKeywords],
      };
    }
    return base;
  }, [selectedServices, city, trade, customFocusAnalysis]);

  const landingPageUrl = `https://${domain || 'example.com'}/estimate`;

  // Seasonal angle
  const seasonalAngle: SeasonalAdAngle = weatherSurge.surgeActive
    ? weatherSurge.recommendedAngle
    : 'standard';

  const seasonalHooks = useMemo(() => generateSeasonalAdCopy(trade, city, seasonalAngle), [trade, city, seasonalAngle]);

  // Responsive Search Ad Copy
  const rsa = useMemo(() => {
    const base = generateResponsiveSearchAd({
      businessName,
      trade,
      city,
      services: selectedServices,
      phone: phone || undefined,
      landingPageUrl,
    });

    let headlines = base.headlines;
    let descriptions = base.descriptions;

    if (customFocusAnalysis.isCustom) {
      headlines = [...customFocusAnalysis.customHeadlines, ...headlines].slice(0, 15);
      descriptions = [...customFocusAnalysis.customDescriptions, ...descriptions].slice(0, 4);
    } else if (seasonalAngle !== 'standard') {
      headlines = [...seasonalHooks.headlineHooks, ...headlines].slice(0, 15);
      descriptions = [seasonalHooks.descriptionHook, ...descriptions].slice(0, 4);
    }

    return {
      ...base,
      headlines,
      descriptions,
    };
  }, [businessName, trade, city, selectedServices, phone, landingPageUrl, seasonalAngle, seasonalHooks, customFocusAnalysis]);

  // Meta Social Ad Copy
  const metaAd = useMemo(() => {
    if (customFocusAnalysis.isCustom) {
      return {
        primaryText: customFocusAnalysis.customMetaPrimaryText,
        headline: customFocusAnalysis.customMetaHeadline,
        description: `★★★★★ 4.9 Stars · Licensed, Insured & Locally Owned`,
        callToAction: 'Get Quote' as const,
        visualHook: `${customFocusAnalysis.rawInput} Feature & Installation`,
      };
    }
    return generateMetaAdCopy({
      businessName,
      trade,
      city,
      services: selectedServices,
      seasonalAngle,
    });
  }, [businessName, trade, city, selectedServices, seasonalAngle, customFocusAnalysis]);

  // Retargeting Banner Ad Copy
  const retargetingAd = useMemo(() => {
    const base = generateRetargetingAdCopy({
      businessName,
      trade,
      city,
    });
    if (customFocusAnalysis.isCustom) {
      return {
        ...base,
        headline: `Still Looking for ${customFocusAnalysis.rawInput}?`,
        offerBadge: customFocusAnalysis.customRetargetingBadge,
      };
    }
    return base;
  }, [businessName, trade, city, customFocusAnalysis]);

  // ROI Calculator Calculations
  const roiMetrics = useMemo(() => {
    const baseLeads = Math.round((currentBundle.leadMin + currentBundle.leadMax) / 2);
    const boostMultiplier = weatherSurge.surgeActive
      ? 1 + (weatherSurge.recommendedBudgetBoostPct || 25) / 100
      : 1.0;
    const effectiveLeads = Math.round(baseLeads * boostMultiplier);
    const wonJobs = Math.max(1, Math.round(effectiveLeads * (closeRatePct / 100)));
    const grossRevenue = wonJobs * avgTicketDollars;
    const roas = Math.round((grossRevenue / currentBundle.totalMonthlyDollars) * 10) / 10;
    const cac = Math.round(currentBundle.totalMonthlyDollars / wonJobs);
    const netReturn = grossRevenue - currentBundle.totalMonthlyDollars;

    return {
      effectiveLeads,
      wonJobs,
      grossRevenue,
      roas,
      cac,
      netReturn,
    };
  }, [currentBundle, weatherSurge.surgeActive, weatherSurge.recommendedBudgetBoostPct, closeRatePct, avgTicketDollars]);

  const handleLaunchAutopilot = async () => {
    if (!MANAGED_ADS_CHECKOUT_ENABLED) {
      alert('Managed Ads Checkout is temporarily in private preview. Automated campaign activation and self-service ad purchases are paused.');
      return;
    }

    if (smsAlertsEnabled && smsAlertPhone.trim() && !isPhoneVerified) {
      alert('Complete 2FA phone verification for your SMS billing alert number before proceeding to launch.');
      if (sms2faStatus === 'idle') {
        void handleSend2faCode();
      }
      return;
    }

    setCheckoutLoading(true);
    try {
      const payload =
        fundingModel === 'auto_refill_wallet'
          ? {
              fundingModel: 'auto_refill_wallet',
              depositAmountDollars: walletDepositDollars,
              refillThresholdDollars: walletRefillThresholdDollars,
              refillAmountDollars: walletRefillAmountDollars,
              maxMonthlySpendDollars: walletMaxMonthlySpendDollars,
              trade,
              city,
              radiusMiles: radius,
              customFocus: customFocus.trim() || undefined,
              scheduleDays: selectedDays.join(','),
              startHour: allHours ? 0 : startHour,
              endHour: allHours ? 24 : endHour,
              smsAlertsEnabled,
              smsAlertPhone: smsAlertPhone.trim() || undefined,
              returnUrl: window.location.href,
            }
          : {
              fundingModel: 'weekly_drip',
              weeklyAmountDollars: currentBundle.weeklyAmountDollars,
              weeklyAdSpendDollars: currentBundle.weeklyAdSpendDollars,
              weeklyFeeDollars: currentBundle.weeklyFeeDollars,
              monthlyBudgetDollars: currentBundle.monthlyAdSpendDollars,
              platformFeeDollars: currentBundle.monthlyFeeDollars,
              interval: 'week',
              trade,
              city,
              radiusMiles: radius,
              customFocus: customFocus.trim() || undefined,
              scheduleDays: selectedDays.join(','),
              startHour: allHours ? 0 : startHour,
              endHour: allHours ? 24 : endHour,
              smsAlertsEnabled,
              smsAlertPhone: smsAlertPhone.trim() || undefined,
              returnUrl: window.location.href,
            };

      const res = await fetch('/api/stripe/ad-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initiate billing session.');
      }
    } catch (err) {
      alert('Unable to connect to billing. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleToggleSmsAlerts = async (enabled: boolean) => {
    setSmsAlertsEnabled(enabled);
    setUpdatingSms(true);
    try {
      const res = await fetch('/api/stripe/ad-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_sms_alerts',
          smsAlertsEnabled: enabled,
          smsAlertPhone: smsAlertPhone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionNotice(enabled ? '📱 SMS billing alerts enabled.' : '🔕 SMS billing alerts disabled.');
      }
    } catch {
      console.warn('Failed to update SMS alert preference.');
    } finally {
      setUpdatingSms(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/ad-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'portal',
          returnUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Unable to open billing portal.');
      }
    } catch (err) {
      alert('Unable to reach customer billing portal.');
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePauseCampaign = async () => {
    if (!confirm('Are you sure you want to pause your ad campaigns? Live bidding will be suspended and your ad spend will pause.')) return;
    setActionLoading('pause');
    setActionNotice(null);
    try {
      const res = await fetch('/api/stripe/ad-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentStatus('paused');
        setActionNotice('⏸️ Ad campaigns paused. Live bidding is suspended.');
      } else {
        alert(data.message || data.error || 'Failed to pause campaign.');
      }
    } catch {
      alert('Network error pausing campaign.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResumeCampaign = async () => {
    setActionLoading('resume');
    setActionNotice(null);
    try {
      const res = await fetch('/api/stripe/ad-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentStatus('active');
        setActionNotice('▶️ Ad campaigns resumed. Live bidding is active.');
      } else {
        alert(data.message || data.error || 'Failed to resume campaign.');
      }
    } catch {
      alert('Network error resuming campaign.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelCampaign = async () => {
    if (!confirm('Are you sure you want to cancel your AI Advertising subscription? Your campaigns will be paused and your subscription will end at the close of your current billing period.')) return;
    setActionLoading('cancel');
    setActionNotice(null);
    try {
      const res = await fetch('/api/stripe/ad-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', immediate: false }),
      });
      const data = await res.json();
      if (data.success) {
        setIsCancelScheduled(true);
        setActionNotice('❌ Subscription cancelled. Campaigns will stop at the end of the billing period.');
      } else {
        alert(data.message || data.error || 'Failed to cancel subscription.');
      }
    } catch {
      alert('Network error cancelling subscription.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadCsv = () => {
    const csvContent = generateGoogleAdsEditorCsv({
      campaignName: `${city} ${trade} - Google Search Ads`,
      monthlyBudget:
        fundingModel === 'auto_refill_wallet' ? walletMaxMonthlySpendDollars : currentBundle.searchSpendDollars,
      dailyBudget: activeDaysPaceDaily,
      targetCity: city,
      targetRadiusMiles: radius,
      rsa,
      keywords: allKeywords,
      negativeKeywords,
      schedule: {
        days: selectedDays,
        startHour: allHours ? 0 : startHour,
        endHour: allHours ? 24 : endHour,
      },
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `google-ads-${trade.toLowerCase()}-${city.toLowerCase().replace(/[^a-z0-9]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setDownloadedCsv(true);
    setTimeout(() => setDownloadedCsv(false), 3000);
  };

  const handleCopyBlueprint = () => {
    const activeDaysStr =
      selectedDays.length === 7
        ? 'All 7 Days (Mon–Sun)'
        : selectedDays.map((d) => DAY_LABELS.find((l) => l.key === d)?.short).join(', ');
    const activeHoursStr = allHours ? '24 Hours / Day' : `${formatHourLabel(startHour)} – ${formatHourLabel(endHour)}`;

    const blueprint =
      fundingModel === 'auto_refill_wallet'
        ? [
            `=== AI ADVERTISING AUTOPILOT BLUEPRINT ===`,
            `Funding Model: Auto-Refilling Advertising Wallet`,
            `Initial Deposit: $${walletDepositDollars} ($${walletDepositDollars} Ad Balance + $${walletFeeDollars} AI Management = $${walletTotalDepositDollars} Total Deposit)`,
            `Auto-Refill Trigger: Adds $${walletRefillAmountDollars} automatically when ad balance drops below $${walletRefillThresholdDollars}`,
            `Max Monthly Spend Cap: $${walletMaxMonthlySpendDollars} / month (Hard Limit Guard)`,
            `Business: ${businessName} (${trade} in ${city})`,
            customFocus ? `Custom Campaign Focus: ${customFocus} (AI Verified: ${customFocusAnalysis.clarityScore}%)` : null,
            `Ad Schedule: ${activeDaysStr} · ${activeHoursStr} (${totalWeeklyHours} hrs/wk)`,
            `Estimated Daily Pacing: ~$${activeDaysPaceDaily.toFixed(2)} / active day`,
            ``,
            `--- GOOGLE SEARCH ADS ---`,
            ...rsa.headlines.slice(0, 5).map((h, i) => `H${i + 1}: ${h}`),
            ``,
            `--- META (INSTAGRAM / FB) FEED ---`,
            `Headline: ${metaAd.headline}`,
            `Text: ${metaAd.primaryText}`,
            ``,
            `--- RETARGETING BANNER ---`,
            `Headline: ${retargetingAd.headline}`,
            `Offer: ${retargetingAd.offerBadge}`,
          ].filter(Boolean).join('\n')
        : [
            `=== AI ADVERTISING AUTOPILOT BLUEPRINT ===`,
            `Funding Model: Weekly Drip All-In Funding`,
            `Plan: ${currentBundle.name} ($${currentBundle.weeklyAmountDollars}/wk · ~$${currentBundle.monthlyAverageDollars}/mo avg)`,
            `Weekly Allocation: $${currentBundle.weeklyAdSpendDollars} Ads + $${currentBundle.weeklyFeeDollars} AI Management`,
            `Business: ${businessName} (${trade} in ${city})`,
            customFocus ? `Custom Campaign Focus: ${customFocus} (AI Verified: ${customFocusAnalysis.clarityScore}%)` : null,
            `Target Leads: ${currentBundle.estimatedLeadsRange}`,
            `Active Channels: ${currentBundle.channels.join(', ')}`,
            `Ad Schedule: ${activeDaysStr} · ${activeHoursStr} (${totalWeeklyHours} hrs/wk)`,
            `Daily Pace: ~$${activeDaysPaceDaily.toFixed(2)} / active day (deployed daily, billed weekly)`,
            ``,
            `--- GOOGLE SEARCH ADS ---`,
            `Daily Pace: ~$${activeDaysPaceDaily.toFixed(2)}/day (on active days)`,
            ...rsa.headlines.slice(0, 5).map((h, i) => `H${i + 1}: ${h}`),
            ``,
            `--- META (INSTAGRAM / FB) FEED ---`,
            `Headline: ${metaAd.headline}`,
            `Text: ${metaAd.primaryText}`,
            ``,
            `--- RETARGETING BANNER ---`,
            `Headline: ${retargetingAd.headline}`,
            `Offer: ${retargetingAd.offerBadge}`,
          ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(blueprint);
    setCopiedBlueprint(true);
    setTimeout(() => setCopiedBlueprint(false), 2500);
  };

  const toggleService = (service: string) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  };

  const isLiveActive = initialWalletState?.status === 'active';

  return (
    <main className="dashboard-page workspace-page mkt-page">
      <div className="section-heading workspace-section-heading">
        <div>
          <h1 className="page-title">AI Advertising Autopilot</h1>
          <p className="page-intro">
            Turn local Google searches and social traffic into high-ticket signed contracts. 100% direct ad network spend, zero agency markups, and closed-loop offline revenue tracking.
          </p>
        </div>
      </div>

      <MarketingNav basePath={basePath} />

      {/* Streamlined Trust & Guarantees Bar */}
      <div className={styles.trustChipsBar}>
        <span className={styles.trustChip}>💧 Weekly Drip ($168–$588/wk) or Auto-Refill Wallet</span>
        <span className={styles.trustChip}>🛡️ Zero Agency Retainers ($0 vs $2,500/mo)</span>
        <span className={styles.trustChip}>⚡ &lt;60s Speed-to-Lead AI SMS</span>
        <span className={styles.trustChip}>🌦️ Weather Surge &amp; Capacity Guard</span>
        <span className={styles.trustChip}>🔄 Closed-Loop Revenue Sync</span>
        <span className={styles.trustChip}>💳 Cancel Anytime</span>
      </div>

      {/* Active vs Purchase View Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className={`btn ${showManagementConsole ? 'primary' : 'ghost'}`}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', borderRadius: '6px' }}
            onClick={() => setShowManagementConsole(true)}
          >
            📊 Active Management Console
          </button>
          <button
            type="button"
            className={`btn ${!showManagementConsole ? 'primary' : 'ghost'}`}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', borderRadius: '6px' }}
            onClick={() => setShowManagementConsole(false)}
          >
            🚀 Launch &amp; Setup Wizard
          </button>
        </div>
        {currentStatus === 'active' && !isCancelScheduled ? (
          <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, background: 'rgba(16, 185, 129, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
            ● Live Campaign Running
          </span>
        ) : currentStatus === 'paused' ? (
          <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, background: 'rgba(245, 158, 11, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
            ⏸️ Bidding Paused
          </span>
        ) : isCancelScheduled ? (
          <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700, background: 'rgba(239, 68, 68, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
            ⏳ Cancelling at Period End
          </span>
        ) : initialWalletState?.status === 'pending_provisioning' ? (
          <span style={{ fontSize: '0.75rem', color: '#f97316', fontWeight: 700, background: 'rgba(249, 115, 22, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
            ⏳ Provisioning in Progress
          </span>
        ) : initialWalletState?.status === 'failed' ? (
          <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700, background: 'rgba(239, 68, 68, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
            ⚠️ Provisioning Action Required
          </span>
        ) : null}
      </div>

      {initialWalletState?.status === 'pending_provisioning' ? (
        <div style={{ background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: '8px', padding: '0.85rem', marginBottom: '1rem', fontSize: '0.84rem' }}>
          <strong>⏳ Subscription Active · Campaign Provisioning:</strong> Your advertising plan is paid and active. Google Ads search campaigns are undergoing administrative provisioning for landing page <code>{initialWalletState.landingPageUrl || landingPageUrl}</code>.
        </div>
      ) : initialWalletState?.status === 'failed' ? (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '0.85rem', marginBottom: '1rem', fontSize: '0.84rem' }}>
          <strong>⚠️ Provisioning Diagnostic:</strong> {initialWalletState.lastPaymentError || 'Campaign provisioning encountered an API notice. Our team has been notified to verify your account.'}
        </div>
      ) : null}

      {showManagementConsole ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
          {/* Top Metrics Strip */}
          <div className="mkt-tiles">
            <article className="panel mkt-tile">
              <span className="mkt-tile-label">Spend This Period</span>
              <strong className="mkt-tile-value">
                ${initialWalletState?.spendThisMonthCents ? Math.round(initialWalletState.spendThisMonthCents / 100) : (fundingModel === 'weekly_drip' ? currentBundle.weeklyAmountDollars : 250)}
              </strong>
              <span className="mkt-tile-note">
                {initialWalletState?.googleCampaignId ? `Google ID: ${initialWalletState.googleCampaignId}` : '100% applied to direct clicks'}
              </span>
            </article>

            <article className="panel mkt-tile">
              <span className="mkt-tile-label">Attributed Leads</span>
              <strong className="mkt-tile-value">{roiMetrics.effectiveLeads}</strong>
              <span className="mkt-tile-note">Inbound calls &amp; quote forms</span>
            </article>

            <article className="panel mkt-tile">
              <span className="mkt-tile-label">Return on Ad Spend</span>
              <strong className="mkt-tile-value" style={{ color: '#10b981' }}>{roiMetrics.roas}x ROAS</strong>
              <span className="mkt-tile-note">${roiMetrics.grossRevenue.toLocaleString()} gross revenue</span>
            </article>
          </div>

          {/* 4 Operational Tabs Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '0.3rem',
              width: 'fit-content',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setManagementTab('overview')}
              style={{
                padding: '0.45rem 0.95rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: '7px',
                background: managementTab === 'overview' ? 'var(--accent, #f97316)' : 'transparent',
                color: managementTab === 'overview' ? '#ffffff' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              📈 Overview
            </button>
            <button
              type="button"
              onClick={() => setManagementTab('targeting')}
              style={{
                padding: '0.45rem 0.95rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: '7px',
                background: managementTab === 'targeting' ? 'var(--accent, #f97316)' : 'transparent',
                color: managementTab === 'targeting' ? '#ffffff' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🎯 Targeting
            </button>
            <button
              type="button"
              onClick={() => setManagementTab('creative')}
              style={{
                padding: '0.45rem 0.95rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: '7px',
                background: managementTab === 'creative' ? 'var(--accent, #f97316)' : 'transparent',
                color: managementTab === 'creative' ? '#ffffff' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🎨 Creative
            </button>
            <button
              type="button"
              onClick={() => setManagementTab('billing')}
              style={{
                padding: '0.45rem 0.95rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: '7px',
                background: managementTab === 'billing' ? 'var(--accent, #f97316)' : 'transparent',
                color: managementTab === 'billing' ? '#ffffff' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              💳 Budget &amp; Billing
            </button>
            <button
              type="button"
              onClick={() => setManagementTab('halo')}
              style={{
                padding: '0.45rem 0.95rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: '7px',
                background: managementTab === 'halo' ? 'var(--accent, #f97316)' : 'transparent',
                color: managementTab === 'halo' ? '#ffffff' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              📍 Neighborhood Halo
            </button>
          </div>

          {/* Tab 1: Overview */}
          {managementTab === 'overview' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              <div className="panel workspace-section-card">
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>🔥 Monthly Budget Pacing</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
                  Deploying daily across Google Search and Meta Ads.
                </p>
                <div style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', height: '12px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ background: '#10b981', height: '100%', width: '42%' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted)' }}>
                  <span>$345 spent this cycle</span>
                  <span>${currentBundle.totalMonthlyDollars} monthly cap</span>
                </div>
              </div>

              <div className="panel workspace-section-card">
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>⚡ Speed-to-Lead Status</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.5rem' }}>
                  AI Auto-SMS is actively qualifying incoming homeowner requests.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.25rem', color: '#10b981', fontWeight: 800 }}>12s</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Average homeowner response time</span>
                </div>
              </div>

              {/* Ad Wallet Burn & Runway Depletion Predictor Widget */}
              <div className={styles.walletBurnWidget} style={{ gridColumn: '1 / -1' }}>
                <div className={styles.walletBurnHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>⏱️</span>
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>
                        Ad Wallet Runway &amp; Depletion Forecast
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>
                        Continuous pacing telemetry based on live click consumption
                      </span>
                    </div>
                  </div>
                  <span
                    className={styles.walletBurnDaysPill}
                    style={{
                      background:
                        walletBurn.urgency === 'healthy'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : walletBurn.urgency === 'warning'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                      color:
                        walletBurn.urgency === 'healthy'
                          ? '#10b981'
                          : walletBurn.urgency === 'warning'
                            ? '#fbbf24'
                            : '#ef4444',
                      border: `1px solid ${
                        walletBurn.urgency === 'healthy'
                          ? 'rgba(16, 185, 129, 0.35)'
                          : walletBurn.urgency === 'warning'
                            ? 'rgba(245, 158, 11, 0.35)'
                            : 'rgba(239, 68, 68, 0.35)'
                      }`,
                    }}
                  >
                    {walletBurn.urgency === 'healthy'
                      ? `● ${walletBurn.estimatedDaysRemaining} Days Runway (Healthy)`
                      : walletBurn.urgency === 'warning'
                        ? `⚠️ ${walletBurn.estimatedDaysRemaining} Days (Refill Approaching)`
                        : `🚨 ${walletBurn.estimatedDaysRemaining} Days (Critical Depletion)`}
                  </span>
                </div>

                <div className={styles.walletBurnGrid}>
                  <div className={styles.walletBurnItem}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>Estimated Runway</span>
                    <strong style={{ fontSize: '1.1rem', color: '#10b981' }}>~{walletBurn.estimatedDaysRemaining} Days</strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginTop: '0.15rem' }}>Continuous coverage</span>
                  </div>

                  <div className={styles.walletBurnItem}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>Daily Burn Rate</span>
                    <strong style={{ fontSize: '1.1rem' }}>${walletBurn.averageDailyBurnDollars.toFixed(2)}/day</strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginTop: '0.15rem' }}>Active search hours</span>
                  </div>

                  <div className={styles.walletBurnItem}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>Predicted Refill Date</span>
                    <strong style={{ fontSize: '0.92rem' }}>
                      {new Date(walletBurn.predictedDepletionDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginTop: '0.15rem' }}>Auto-top up target</span>
                  </div>

                  <div className={styles.walletBurnItem}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>Auto-Refill Amount</span>
                    <strong style={{ fontSize: '1.1rem', color: '#38bdf8' }}>+${walletBurn.recommendedRefillAmountDollars}</strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginTop: '0.15rem' }}>
                      Trigger: &lt; ${( (initialWalletState?.refillThresholdCents || 7500) / 100).toFixed(0)}
                    </span>
                  </div>
                </div>

                {walletBurn.isWeekendSurgeImpending ? (
                  <div className={styles.walletBurnSurgeAlert}>
                    <span>🌪️</span>
                    <span>
                      <strong>Weekend Search Surge Active (+35%):</strong> Homeowner quote searches surge Friday–Sunday. Wallet burn pacing has automatically accounted for higher weekend demand.
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Closed-Loop Offline Revenue Synchronization Telemetry Card */}
              <div className={styles.offlineSyncCard} style={{ gridColumn: '1 / -1' }}>
                <div className={styles.offlineSyncHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>🔄</span>
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>
                        Closed-Loop Offline Revenue Synchronization
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>
                        Live telemetry feeding signed CRM contract values back to Google Smart Bidding
                      </span>
                    </div>
                  </div>
                  <span className={styles.offlineSyncBadge}>
                    <span>●</span> Active &amp; Synced with Google Ads API v25
                  </span>
                </div>

                <div className={styles.offlineSyncGrid}>
                  <div className={styles.offlineSyncItem}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>Conversion Pipeline</span>
                    <strong style={{ fontSize: '0.95rem', color: '#10b981' }}>Enhanced Offline Conversions</strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginTop: '0.15rem' }}>GCLID + SHA-256 Hashed Match</span>
                  </div>

                  <div className={styles.offlineSyncItem}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>Algorithm Bidding Target</span>
                    <strong style={{ fontSize: '0.95rem', color: '#38bdf8' }}>Max Value / Target ROAS</strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginTop: '0.15rem' }}>Prioritizes $3k–$15k+ jobs</span>
                  </div>

                  <div className={styles.offlineSyncItem}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>Attributed Pipeline Value</span>
                    <strong style={{ fontSize: '1.1rem', color: '#10b981' }}>${roiMetrics.grossRevenue.toLocaleString()}</strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginTop: '0.15rem' }}>Projected signed contracts</span>
                  </div>

                  <div className={styles.offlineSyncItem}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block' }}>Feedback Frequency</span>
                    <strong style={{ fontSize: '0.95rem' }}>Hourly Queue Sync</strong>
                    <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'block', marginTop: '0.15rem' }}>Instant on CRM quote signing</span>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                  🛡️ <strong>Why this is your competitive moat:</strong> Standard agencies only count form clicks. Let’s Get Quoted feeds actual dollar amounts from signed CRM contracts back into Google AI. Over time, Google automatically stops bidding on low-ticket $80 repairs and concentrates your ad budget on high-margin replacement and remodel shoppers.
                </p>
              </div>
            </div>
          ) : null}

          {/* Tab 2: Targeting */}
          {managementTab === 'targeting' ? (
            <div className="panel workspace-section-card">
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>🎯 Advertised Services &amp; Radius</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
                Currently targeting {city} within a {radius}-mile radius.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
                {selectedServices.map((svc) => (
                  <span key={svc} style={{ background: 'rgba(249, 115, 22, 0.15)', color: 'var(--accent, #f97316)', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600 }}>
                    ✓ {svc}
                  </span>
                ))}
              </div>
              {customFocus ? (
                <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '0.75rem' }}>
                  <strong style={{ fontSize: '0.82rem', color: '#38bdf8' }}>Custom Promotion / Focus:</strong>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--foreground)' }}>{customFocus}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Tab 3: Creative */}
          {managementTab === 'creative' ? (
            <div className="panel workspace-section-card">
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>🎨 Live Ad Creatives</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
                Google Search Responsive Headlines and Meta Feed creatives deployed for {businessName}.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {rsa.headlines.slice(0, 4).map((h, i) => (
                  <div key={i} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--muted)', marginRight: '0.5rem' }}>Headline {i + 1}:</span>
                    <strong>{h}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Tab 4: Budget & Billing */}
          {managementTab === 'billing' ? (
            <div className="panel workspace-section-card">
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>💳 Continuous Ad Spend &amp; Balance Consumption</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 1rem' }}>
                Your ad spend is continuously deployed to Google &amp; Meta. Clicks are deducted daily from your available balance, and auto-refills trigger when balance falls below your threshold.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.65rem', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem' }}>Available Ad Balance</span>
                  <strong style={{ color: '#10b981', fontSize: '1.1rem' }}>
                    ${initialWalletState?.walletBalanceCents !== undefined ? (initialWalletState.walletBalanceCents / 100).toFixed(2) : (fundingModel === 'auto_refill_wallet' ? walletDepositDollars.toFixed(2) : '—')}
                  </strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>
                    Auto-refills at &lt; ${( (initialWalletState?.refillThresholdCents || 7500) / 100).toFixed(2)}
                  </span>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.65rem', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem' }}>Consumed This Month</span>
                  <strong style={{ fontSize: '1.1rem' }}>
                    ${((initialWalletState?.spendThisMonthCents || 0) / 100).toFixed(2)}
                  </strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>
                    Max Monthly Cap: ${((initialWalletState?.maxMonthlySpendCents || (walletMaxMonthlySpendDollars * 100)) / 100).toFixed(2)}
                  </span>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.65rem', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem' }}>Funding Model &amp; Status</span>
                  <strong>{initialWalletState?.fundingModel === 'auto_refill_wallet' || fundingModel === 'auto_refill_wallet' ? 'Auto-Refilling Wallet' : 'Weekly Drip All-In'}</strong>
                  <span style={{ fontSize: '0.7rem', color: isLiveActive ? '#10b981' : 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>
                    {isLiveActive ? '● Active & Consuming' : '○ Standby'}
                  </span>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.65rem', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem' }}>Google Campaign ID</span>
                  <code>{initialWalletState?.googleCampaignId || 'gads_auto_linked'}</code>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>
                    Last payment: {initialWalletState?.lastPaymentAt ? new Date(initialWalletState.lastPaymentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent'}
                  </span>
                </div>
              </div>

              {/* Daily Spend Consumption Log Table */}
              <div style={{ marginBottom: '1.25rem' }}>
                <strong style={{ fontSize: '0.86rem', display: 'block', marginBottom: '0.5rem' }}>
                  📊 Recent Daily Click Spend &amp; Consumption History
                </strong>
                {initialWalletState?.dailySpendHistory && initialWalletState.dailySpendHistory.length > 0 ? (
                  <div style={{ overflowX: 'auto', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px' }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                          <th style={{ padding: '0.45rem 0.6rem' }}>Date</th>
                          <th style={{ padding: '0.45rem 0.6rem' }}>Network</th>
                          <th style={{ padding: '0.45rem 0.6rem' }}>Impressions</th>
                          <th style={{ padding: '0.45rem 0.6rem' }}>Clicks</th>
                          <th style={{ padding: '0.45rem 0.6rem' }}>Conversions</th>
                          <th style={{ padding: '0.45rem 0.6rem' }}>Consumed Spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {initialWalletState.dailySpendHistory.slice(0, 7).map((entry) => (
                          <tr key={entry.date} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <td style={{ padding: '0.45rem 0.6rem' }}>{entry.date}</td>
                            <td style={{ padding: '0.45rem 0.6rem' }}>
                              {entry.source === 'google_ads_api' ? 'Google Search' : entry.source === 'meta_ads_api' ? 'Meta Feed' : 'Daily Paced'}
                            </td>
                            <td style={{ padding: '0.45rem 0.6rem' }}>{entry.impressions.toLocaleString()}</td>
                            <td style={{ padding: '0.45rem 0.6rem' }}>{entry.clicks}</td>
                            <td style={{ padding: '0.45rem 0.6rem' }}>{entry.conversions}</td>
                            <td style={{ padding: '0.45rem 0.6rem', color: '#f97316', fontWeight: 700 }}>
                              -${(entry.spendCents / 100).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0, padding: '0.65rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px' }}>
                    Daily click consumption is logged as Google and Meta report search clicks.
                  </p>
                )}
              </div>

              {actionNotice ? (
                <div style={{ background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: '6px', padding: '0.65rem 0.85rem', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--foreground)' }}>
                  {actionNotice}
                </div>
              ) : null}

              {isCancelScheduled ? (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.65rem 0.85rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#fca5a5' }}>
                  ⏳ <strong>Cancellation Scheduled:</strong> Your subscription is set to end at the close of your current billing period. No further charges will occur.
                </div>
              ) : null}

              {/* SMS Alerts Management Setting */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.85rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <strong style={{ fontSize: '0.86rem', display: 'block' }}>📱 SMS Billing &amp; Refill Alerts</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>
                      Sends a text 24 hours before weekly renewals and when ad wallet auto-refills occur.
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`btn ${smsAlertsEnabled ? 'secondary' : 'ghost'}`}
                    onClick={() => handleToggleSmsAlerts(!smsAlertsEnabled)}
                    disabled={updatingSms}
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                  >
                    {updatingSms ? 'Saving...' : smsAlertsEnabled ? '🔔 SMS Alerts: ON' : '🔕 SMS Alerts: OFF'}
                  </button>
                </div>
              </div>

              {/* In-App Management Actions */}
              <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {currentStatus === 'active' ? (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handlePauseCampaign}
                    disabled={actionLoading !== null}
                    style={{ fontSize: '0.82rem', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                  >
                    {actionLoading === 'pause' ? 'Pausing Bidding...' : '⏸️ Pause Ad Bidding'}
                  </button>
                ) : currentStatus === 'paused' ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={handleResumeCampaign}
                    disabled={actionLoading !== null}
                    style={{ fontSize: '0.82rem' }}
                  >
                    {actionLoading === 'resume' ? 'Resuming Bidding...' : '▶️ Resume Ad Bidding'}
                  </button>
                ) : null}

                {!isCancelScheduled && (currentStatus === 'active' || currentStatus === 'paused') ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={handleCancelCampaign}
                    disabled={actionLoading !== null}
                    style={{ fontSize: '0.82rem', color: '#ef4444' }}
                  >
                    {actionLoading === 'cancel' ? 'Cancelling...' : '❌ Cancel Subscription'}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleOpenBillingPortal}
                  disabled={portalLoading}
                  style={{ fontSize: '0.82rem' }}
                >
                  {portalLoading ? 'Opening Portal...' : '⚙️ Manage Payment in Stripe Portal'}
                </button>
              </div>
            </div>
          ) : null}

          {/* Tab 5: Neighborhood Halo */}
          {managementTab === 'halo' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="panel workspace-section-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>📍 Neighborhood Halo 1-Mile Micro-Ads</h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0.25rem 0 0' }}>
                      Automatically surrounds completed job sites with hyper-local geofenced ads on Facebook, Instagram, and Google.
                    </p>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '0.25rem 0.65rem', borderRadius: '12px', fontWeight: 700 }}>
                    ⚡ Autopilot Ready ($25 / 5 days)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>Default Radius</span>
                    <strong style={{ fontSize: '1rem' }}>1.0 Mile Radius</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>Covers immediate neighborhood &amp; adjacent streets</span>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>Per-Job Micro-Budget</span>
                    <strong style={{ fontSize: '1rem', color: '#10b981' }}>$25.00 / Completed Job</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>Paced over 5 active days</span>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>Privacy Safeguard</span>
                    <strong style={{ fontSize: '1rem', color: '#38bdf8' }}>🔒 Street-Level Only</strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>Exact house numbers are scrubbed from public ads</span>
                  </div>
                </div>

                {/* Example Active / Simulated Halo Zone */}
                <div style={{ background: 'rgba(249, 115, 22, 0.06)', border: '1px solid rgba(249, 115, 22, 0.25)', borderRadius: '8px', padding: '0.85rem', marginBottom: '1rem' }}>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--accent, #f97316)', display: 'block', marginBottom: '0.4rem' }}>
                    🎨 Live Creative &amp; Dynamic Copy Preview
                  </strong>
                  <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', padding: '0.75rem', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                    <div style={{ color: '#38bdf8', marginBottom: '0.3rem' }}>
                      📍 Just Completed on Maple Ave in {city}!
                    </div>
                    <div style={{ color: 'var(--foreground)', lineHeight: 1.4 }}>
                      &ldquo;Our team at {businessName} just finished a full {trade.toLowerCase()} installation. While our trucks and crews are in the area this week, neighbors can claim priority scheduling and a free estimate.&rdquo;
                    </div>
                    <div style={{ marginTop: '0.5rem', color: '#10b981', fontWeight: 700 }}>
                      👉 Button: Claim Neighbor Offer (Links to localized Before &amp; After Showcase)
                    </div>
                  </div>
                </div>

                {/* Street Cluster Group Pricing & Satellite Sizing Settings */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  {/* Card 1: Street Cluster Group Pricing */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.88rem' }}>🏘️ Active Street Cluster Pricing</strong>
                      <span style={{ fontSize: '0.7rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.5rem', borderRadius: '8px', fontWeight: 600 }}>Active</span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
                      Unlocks tiered group discounts for neighbors on the same street and enables same-day estimate batching.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px' }}>
                        <span>2 Homes (Duo):</span>
                        <strong style={{ color: '#10b981' }}>$100 Off Each</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px' }}>
                        <span>3+ Homes (Street Cluster):</span>
                        <strong style={{ color: '#10b981' }}>$250 Off Each</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px' }}>
                        <span>5+ Homes (HOA Rate):</span>
                        <strong style={{ color: '#10b981' }}>$500 Off Each</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '4px', marginTop: '0.2rem' }}>
                        <span style={{ color: '#38bdf8' }}>Margin Floor Guard:</span>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>Max 10% of Quote</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Instant Satellite Property Sizing */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.88rem' }}>🛰️ Instant Satellite Property Sizing</strong>
                      <span style={{ fontSize: '0.7rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '0.15rem 0.5rem', borderRadius: '8px', fontWeight: 600 }}>Enabled</span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
                      Pulls aerial building footprints to calculate true roof squares, pitch multipliers, siding area, and HVAC tonnage.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px' }}>
                        <span>Roof Pitch Support:</span>
                        <span>Flat to 10/12</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px' }}>
                        <span>Waste Factor Buffer:</span>
                        <span>+12% Industry Standard</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px' }}>
                        <span>HVAC Tonnage Ratio:</span>
                        <span>1 Ton / 550 sq ft</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '4px', marginTop: '0.2rem' }}>
                        <span style={{ color: '#10b981' }}>Batch Route Booking:</span>
                        <span style={{ color: '#10b981', fontWeight: 600 }}>Same-Day Slots Active</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Collapsible AI Strategy Briefing with Seasonal Demand Posture */}
      <div className={styles.strategyBriefingCard}>
        <div
          className={styles.strategyBriefingHeader}
          onClick={() => setShowAiBriefing(!showAiBriefing)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.35rem' }}>🤖</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong className={styles.strategyBriefingTitle}>
                  AI Growth Strategy for {trade} in {city.split(',')[0]}
                </strong>
                <span
                  className={`${styles.seasonalDemandBadge} ${
                    seasonalDemand.demandPosture === 'peak'
                      ? styles.demandPeak
                      : seasonalDemand.demandPosture === 'shoulder'
                        ? styles.demandShoulder
                        : styles.demandOffPeak
                  }`}
                  style={{ marginBottom: 0 }}
                >
                  {seasonalDemand.demandPosture === 'peak'
                    ? `🔥 Peak Demand Season (${seasonalDemand.seasonalMultiplier.toFixed(2)}x Multiplier)`
                    : seasonalDemand.demandPosture === 'shoulder'
                      ? `🍂 Shoulder Demand Season (${seasonalDemand.seasonalMultiplier.toFixed(2)}x Multiplier)`
                      : `❄️ Off-Peak Season (${seasonalDemand.seasonalMultiplier.toFixed(2)}x Multiplier)`}
                </span>
              </div>
              <span className={styles.strategyBriefingSub}>
                Pre-configured Google Search &amp; Retargeting with 3 AI Safety Shields.
              </span>
            </div>
          </div>
          <span className={styles.strategyBriefingAction}>
            {showAiBriefing ? 'Hide Briefing ▲' : 'Read Briefing ▼'}
          </span>
        </div>
        {showAiBriefing && (
          <div style={{ marginTop: '0.65rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.5rem', lineHeight: 1.45 }}>
              We pre-built your Google Search and Social Retargeting campaigns with verified local buyer keywords in {city}. All safety shields (Weather Surge Radar, Fully-Booked Capacity Pause, and Competitor Waste Scrubbing) are configured. Choose your plan below to launch.
            </p>
            <div className={styles.seasonalDemandCard}>
              <strong className={styles.seasonalDemandGuidance}>
                💡 Trade Seasonal Pricing &amp; Bidding Directive:
              </strong>
              <span style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.4, display: 'block' }}>
                {seasonalDemand.guidance}
              </span>
            </div>
          </div>
        )}
      </div>

      {capacityGuard.shouldPauseBidding ? (
        <div className={styles.capacityAlert}>
          <span>🛡️</span>
          <span>{capacityGuard.reason} Ads are automatically paused while your team is fully booked.</span>
        </div>
      ) : null}

      <div className={styles.cockpitLayout}>
        {/* Left Column: Segmented 3-Step Configuration Cockpit */}
        <div className="panel workspace-section-card">
          {/* Segmented Cockpit Configuration Navigation Tabs */}
          <div className={styles.cockpitTabsNav} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={configTab === 'plan'}
              className={`${styles.cockpitTab} ${configTab === 'plan' ? styles.cockpitTabActive : ''}`}
              onClick={() => setConfigTab('plan')}
            >
              <div className={styles.cockpitTabTitle}>
                <span>1. 💳</span>
                <span>Plan &amp; Budget</span>
                <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 800 }}>✓</span>
              </div>
              <span className={styles.cockpitTabBadge}>
                {fundingModel === 'weekly_drip' ? `$${currentBundle.weeklyAmountDollars}/wk` : `$${walletDepositDollars} Wallet`}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={configTab === 'schedule'}
              className={`${styles.cockpitTab} ${configTab === 'schedule' ? styles.cockpitTabActive : ''}`}
              onClick={() => setConfigTab('schedule')}
            >
              <div className={styles.cockpitTabTitle}>
                <span>2. 📍</span>
                <span>Location &amp; Schedule</span>
                <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 800 }}>✓</span>
              </div>
              <span className={styles.cockpitTabBadge}>
                {city.split(',')[0]} · {activeDaysCount}d/wk
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={configTab === 'focus_roi'}
              className={`${styles.cockpitTab} ${configTab === 'focus_roi' ? styles.cockpitTabActive : ''}`}
              onClick={() => setConfigTab('focus_roi')}
            >
              <div className={styles.cockpitTabTitle}>
                <span>3. 🎯</span>
                <span>Focus &amp; ROI</span>
                <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 800 }}>✓</span>
              </div>
              <span className={styles.cockpitTabBadge}>
                {customFocus ? '✨ Custom' : `${roiMetrics.roas}x ROAS`}
              </span>
            </button>
          </div>

          {/* TAB 1: PLAN & BUDGET */}
          {configTab === 'plan' && (
            <div>
              <div className="section-heading workspace-section-heading compact-heading" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <p className="eyebrow">Step 1 · Budget Model</p>
                  <h2 style={{ fontSize: '1.25rem' }}>Select Your Funding &amp; Growth Plan</h2>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '20px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: isLiveActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                    color: isLiveActive ? '#10b981' : 'var(--muted)',
                    border: isLiveActive ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.15)',
                  }}
                >
                  {isLiveActive ? '● Autopilot Active' : '○ Ready to Launch'}
                </span>
              </div>

              {/* Funding Model Switcher */}
              <div className={styles.fundingModelToggleRow}>
                <button
                  type="button"
                  className={`${styles.fundingModelBtn} ${fundingModel === 'weekly_drip' ? styles.fundingModelActive : ''}`}
                  onClick={() => setFundingModel('weekly_drip')}
                >
                  <span className={styles.fundingModelIcon}>💧</span>
                  <div style={{ textAlign: 'left' }}>
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>Weekly Drip Funding</strong>
                    <small style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                      Predictable all-in weekly plans ($168–$588/wk)
                    </small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`${styles.fundingModelBtn} ${fundingModel === 'auto_refill_wallet' ? styles.fundingModelActive : ''}`}
                  onClick={() => setFundingModel('auto_refill_wallet')}
                >
                  <span className={styles.fundingModelIcon}>💳</span>
                  <div style={{ textAlign: 'left' }}>
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>Auto-Refill Wallet</strong>
                    <small style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                      Deposit $250 today · Re-adds &lt;$75 · Max monthly cap
                    </small>
                  </div>
                </button>
              </div>

              {fundingModel === 'weekly_drip' ? (
                <>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.85rem', lineHeight: 1.45 }}>
                    Weekly all-in funding lowers your first charge without starving the campaign. We deploy your click budget daily into Google &amp; Meta, but bill your card only once every 7 days.
                  </p>

                  <div className={styles.bundleGrid}>
                    {SMART_BUNDLES.map((bundle) => {
                      const isSelected = selectedBundleId === bundle.id;
                      return (
                        <button
                          key={bundle.id}
                          type="button"
                          className={`${styles.bundleCard} ${isSelected ? styles.selected : ''}`}
                          onClick={() => setSelectedBundleId(bundle.id)}
                        >
                          {bundle.badge ? <span className={styles.popularBadge}>{bundle.badge}</span> : null}
                          <span className={styles.bundleName}>{bundle.name}</span>
                          <strong className={styles.bundlePrice}>
                            ${bundle.weeklyAmountDollars}
                            <span className={styles.bundlePeriod}>/ wk</span>
                          </strong>
                          <span className={styles.bundleMonthlySub}>
                            ~${bundle.monthlyAverageDollars}/mo avg
                          </span>
                          <span className={styles.bundleAllocationPill}>
                            ~${bundle.weeklyAdSpendDollars} ads + ${bundle.weeklyFeeDollars ? `$${bundle.weeklyFeeDollars}` : '$0'} fee
                          </span>
                          <span className={styles.bundleLeads}>~{bundle.estimatedLeadsRange}</span>

                          <ul className={styles.bundleFeatures}>
                            {bundle.features.map((feat) => (
                              <li key={feat} className={styles.bundleCheckItem}>
                                <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                                <span>{feat}</span>
                              </li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>

                  {/* Smart Shield Bar */}
                  <div className={styles.smartShieldBar}>
                    <div className={styles.smartShieldHeader}>
                      <span>🛡️</span>
                      <span>AI Smart Shield Active &amp; Protecting Your Budget</span>
                    </div>
                    <p className={styles.smartShieldDesc}>
                      Includes automatic Weather Surge Boosts (+25% during storms/freezes), Fully-Booked Auto-Pause Guard, and Competitor Search Exclusion filters.
                    </p>
                  </div>

                  {/* Transparent Fee Callout */}
                  <div className={styles.transparentFeeCallout}>
                    <div className={styles.transparentFeeLeft}>
                      <span style={{ fontSize: '1.25rem' }}>🛡️</span>
                      <div>
                        <span className={styles.transparentFeeTitle}>100% Direct Ad Click Transparency</span>
                        <span className={styles.transparentFeeSub}>Zero agency retainer markups or hidden click arbitrage</span>
                      </div>
                    </div>
                    <div className={styles.transparentFeePills}>
                      <span className={styles.transparentFeeTag}>
                        ${currentBundle.weeklyAdSpendDollars}/wk (100% clicks)
                      </span>
                      <span style={{ color: 'var(--muted)' }}>+</span>
                      <span className={styles.transparentFeeTag} style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.35)', background: 'rgba(56, 189, 248, 0.12)' }}>
                        ${currentBundle.weeklyFeeDollars}/wk (AI Platform)
                      </span>
                    </div>
                  </div>

                  {/* Transparent Weekly Cost Breakdown Accordion */}
                  <div className={styles.costBreakdown}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onClick={() => setShowWeeklyCostDetails(!showWeeklyCostDetails)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.82rem', color: 'var(--foreground)' }}>
                          Weekly Drip Allocation &amp; Math
                        </strong>
                        <span style={{ fontSize: '0.68rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '10px', fontWeight: 600 }}>
                          ${currentBundle.weeklyAdSpendDollars} Ads + ${currentBundle.weeklyFeeDollars ? `$${currentBundle.weeklyFeeDollars}` : '$0'} Fee
                        </span>
                      </div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--accent, #f97316)', fontWeight: 600 }}>
                        {showWeeklyCostDetails ? 'Hide Details ▲' : 'View Breakdown ▼'}
                      </span>
                    </div>

                    {showWeeklyCostDetails && (
                      <div style={{ marginTop: '0.65rem' }}>
                        <div className={styles.breakdownRow}>
                          <span>Direct Ad Click Spend (deployed daily to Google/Meta)</span>
                          <strong>${currentBundle.weeklyAdSpendDollars} / wk <span style={{ fontWeight: 400, opacity: 0.8 }}>(~${currentBundle.monthlyAdSpendDollars}/mo)</span></strong>
                        </div>
                        <div className={styles.breakdownRow}>
                          <span>AI Campaign Autopilot &amp; Smart Bidding Management</span>
                          <span>${currentBundle.weeklyFeeDollars} / wk <span style={{ fontWeight: 400, opacity: 0.8 }}>(~${currentBundle.monthlyFeeDollars}/mo)</span></span>
                        </div>
                        <div className={styles.breakdownTotal}>
                          <span>Total Weekly Funding</span>
                          <span style={{ color: 'var(--accent, #f97316)', textAlign: 'right' }}>
                            ${currentBundle.weeklyAmountDollars} / week
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', display: 'block' }}>
                              (~${currentBundle.monthlyAverageDollars}/mo monthly average)
                            </span>
                          </span>
                        </div>
                        <div className={styles.weeklyAdvantageNote}>
                          💡 <strong>Why Weekly Drip Billing?</strong> Lowers your upfront cost by over 75% compared to paying a massive monthly invoice all at once. Your ad spend is deployed smoothly into Google/Meta every day, but your card is only billed once every 7 days (no individual daily charges).
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Auto-Refill Advertising Wallet UI */
                <div className={styles.walletConfigContainer}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.85rem', lineHeight: 1.45 }}>
                    Start with a smaller deposit today ($250). When your advertising balance falls below $75, your wallet automatically tops up by another $250. You set a hard <strong>MAX Monthly Spend</strong> ceiling so you never exceed your budget.
                  </p>

                  {/* 1. Deposit Presets */}
                  <div className={styles.walletFieldGroup}>
                    <div className={styles.walletFieldHeader}>
                      <label htmlFor="wallet-deposit-250" style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--foreground)' }}>
                        1. Starting Deposit &amp; Auto-Refill Amount
                      </label>
                      <span style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 700 }}>
                        Deposit ${walletDepositDollars} today
                      </span>
                    </div>
                    <div className={styles.depositPresetsGrid}>
                      {[
                        { amt: 250, label: 'Recommended (Start Small)' },
                        { amt: 500, label: 'Medium Volume' },
                        { amt: 1000, label: 'High Volume' },
                      ].map(({ amt, label }) => (
                        <button
                          key={amt}
                          id={`wallet-deposit-${amt}`}
                          type="button"
                          className={`${styles.depositPresetBtn} ${walletDepositDollars === amt ? styles.depositActive : ''}`}
                          onClick={() => {
                            setWalletDepositDollars(amt);
                            setWalletRefillAmountDollars(amt);
                            setWalletRefillThresholdDollars(Math.round(amt * 0.3));
                          }}
                        >
                          <span style={{ fontSize: '1.15rem', fontWeight: 900 }}>${amt}</span>
                          <small style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                            {label}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Refill Threshold & 3. Max Monthly Spend */}
                  <div className={styles.walletTwoCol}>
                    <div className={styles.walletFieldGroup}>
                      <label
                        htmlFor="wallet-threshold-select"
                        style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--foreground)', display: 'block', marginBottom: '0.2rem' }}
                      >
                        2. Auto-Refill Trigger
                      </label>
                      <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0 0 0.4rem' }}>
                        Re-adds ${walletRefillAmountDollars} when ad balance drops below:
                      </p>
                      <select
                        id="wallet-threshold-select"
                        aria-label="Auto-refill trigger threshold"
                        value={walletRefillThresholdDollars}
                        onChange={(e) => setWalletRefillThresholdDollars(Number(e.target.value))}
                        className={styles.walletSelect}
                      >
                        <option value={50}>Below $50.00</option>
                        <option value={75}>Below $75.00 (Recommended)</option>
                        <option value={100}>Below $100.00</option>
                        <option value={150}>Below $150.00</option>
                        <option value={300}>Below $300.00</option>
                      </select>
                    </div>

                    <div className={styles.walletFieldGroup}>
                      <label
                        htmlFor="wallet-max-spend-select"
                        style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--foreground)', display: 'block', marginBottom: '0.2rem' }}
                      >
                        3. MAX Monthly Spend Cap
                      </label>
                      <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0 0 0.4rem' }}>
                        Hard stop: Auto-pauses if monthly spend reaches:
                      </p>
                      <select
                        id="wallet-max-spend-select"
                        aria-label="Max monthly spend cap"
                        value={walletMaxMonthlySpendDollars}
                        onChange={(e) => setWalletMaxMonthlySpendDollars(Number(e.target.value))}
                        className={styles.walletSelect}
                      >
                        <option value={750}>$750 / month</option>
                        <option value={1000}>$1,000 / month (Recommended)</option>
                        <option value={1500}>$1,500 / month</option>
                        <option value={2500}>$2,500 / month</option>
                        <option value={5000}>$5,000 / month</option>
                      </select>
                    </div>
                  </div>

                  {/* Visual Wallet Lifecycle Diagram Card */}
                  <div className={styles.walletFlowCard}>
                    <div className={styles.walletFlowHeader}>
                      <span>💳</span>
                      <strong style={{ fontSize: '0.85rem' }}>Auto-Refill Wallet Lifecycle &amp; Safeguards</strong>
                    </div>

                    <div className={styles.walletStepsRow}>
                      <div className={styles.walletStepBox}>
                        <span className={styles.walletStepNum}>1</span>
                        <strong style={{ color: '#10b981', display: 'block', fontSize: '0.85rem' }}>
                          ${walletDepositDollars} Deposit
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                          Funded today to launch ad traffic
                        </span>
                      </div>

                      <span className={styles.walletArrow}>➔</span>

                      <div className={styles.walletStepBox}>
                        <span className={styles.walletStepNum}>2</span>
                        <strong style={{ color: '#f59e0b', display: 'block', fontSize: '0.85rem' }}>
                          &lt; ${walletRefillThresholdDollars} Trigger
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                          Auto-adds ${walletRefillAmountDollars} as clicks happen
                        </span>
                      </div>

                      <span className={styles.walletArrow}>➔</span>

                      <div className={styles.walletStepBox}>
                        <span className={styles.walletStepNum}>3</span>
                        <strong style={{ color: '#ef4444', display: 'block', fontSize: '0.85rem' }}>
                          ${walletMaxMonthlySpendDollars}/mo Max
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                          Hard cap prevents runaway spend
                        </span>
                      </div>
                    </div>

                    <div className={styles.walletBreakdownBox}>
                      <div className={styles.breakdownRow}>
                        <span>Direct Ad Click Balance (100% applied to clicks)</span>
                        <strong>${walletDepositDollars}.00</strong>
                      </div>
                      <div className={styles.breakdownRow}>
                        <span>AI Platform Management &amp; Smart Bidding ({Math.round(AD_PLATFORM_FEE_RATE * 100)}%)</span>
                        <span>${walletFeeDollars}.00</span>
                      </div>
                      <div className={styles.breakdownTotal}>
                        <span>Initial Total Deposit Today</span>
                        <span style={{ color: 'var(--accent, #f97316)' }}>${walletTotalDepositDollars}.00</span>
                      </div>
                      <p className={styles.walletAdvantageText}>
                        🛡️ <strong>Zero Risk Guarantee:</strong> Unused wallet funds never expire. If demand slows down, clicks pause and you are never charged on arbitrary calendar dates.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1 Completion Navigation */}
              <div className={styles.tabStepperRow}>
                <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                  Step 1 of 3 · Budget plan selected
                </span>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setConfigTab('schedule')}
                  style={{ fontSize: '0.82rem', padding: '0.5rem 1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <span>Continue to Location &amp; Schedule</span>
                  <span style={{ fontWeight: 800 }}>➔</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: LOCATION & SCHEDULE */}
          {configTab === 'schedule' && (
            <div>
              <div className="section-heading workspace-section-heading compact-heading" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <p className="eyebrow">Step 2 · Geo &amp; Hours</p>
                  <h2 style={{ fontSize: '1.25rem' }}>Service Area &amp; Active Hours</h2>
                </div>
                <span className={styles.activeHoursBadge}>
                  {totalWeeklyHours} hrs / week active
                </span>
              </div>

              {/* Location & Radius Card */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.9rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.75rem',
                    marginBottom: '0.85rem',
                  }}
                >
                  <div>
                    <label
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--foreground)',
                        display: 'block',
                        marginBottom: '0.3rem',
                      }}
                    >
                      Target City
                    </label>
                    <CityAutocomplete
                      id="target-city-input"
                      value={city}
                      onChange={setCity}
                      placeholder="e.g. Royal Oak, MI"
                      style={{ fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <label
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: 'var(--foreground)',
                        }}
                      >
                        Service Radius: {radius} miles
                      </label>
                      <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
                        ~{Math.round(Math.PI * radius * radius).toLocaleString()} sq mi
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={60}
                      step={5}
                      value={radius}
                      onChange={(e) => setRadius(Number(e.target.value))}
                      style={{ width: '100%', marginTop: '0.25rem' }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--foreground)',
                      }}
                    >
                      Active Trade Specialties ({selectedServices.length} Selected)
                    </label>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedServices(availableServices)}
                        className={styles.quickDayLink}
                      >
                        Select All
                      </button>
                      <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>·</span>
                      <button
                        type="button"
                        onClick={() => setSelectedServices([])}
                        className={styles.quickDayLink}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {availableServices.map((service) => {
                      const isSel = selectedServices.includes(service);
                      return (
                        <button
                          key={service}
                          type="button"
                          onClick={() => toggleService(service)}
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: isSel ? 'var(--accent, #f97316)' : 'rgba(255,255,255,0.06)',
                            color: isSel ? '#ffffff' : 'var(--foreground)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {isSel ? '✓ ' : '+ '}
                          {service}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Dayparting Schedule */}
              <div className={styles.scheduleSectionCard}>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.85rem', lineHeight: 1.45 }}>
                  Choose which days and hours your ads should run. Ads automatically pause overnight or on weekends so you never pay for clicks when no one is available to answer the phone.
                </p>

                {/* Quick Presets */}
                <div className={styles.schedulePresetsRow}>
                  <button
                    type="button"
                    className={`${styles.schedulePresetBtn} ${
                      selectedDays.length === 5 &&
                      !selectedDays.includes('SATURDAY') &&
                      !selectedDays.includes('SUNDAY') &&
                      !allHours &&
                      startHour === 7 &&
                      endHour === 18
                        ? styles.presetActive
                        : ''
                    }`}
                    onClick={() => {
                      setSelectedDays(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']);
                      setStartHour(7);
                      setEndHour(18);
                      setAllHours(false);
                    }}
                  >
                    ⚡ Weekdays (Mon–Fri · 7 AM–6 PM)
                  </button>
                  <button
                    type="button"
                    className={`${styles.schedulePresetBtn} ${
                      selectedDays.length === 6 &&
                      !selectedDays.includes('SUNDAY') &&
                      !allHours &&
                      startHour === 7 &&
                      endHour === 18
                        ? styles.presetActive
                        : ''
                    }`}
                    onClick={() => {
                      setSelectedDays(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']);
                      setStartHour(7);
                      setEndHour(18);
                      setAllHours(false);
                    }}
                  >
                    🏢 Mon–Sat (7 AM–6 PM)
                  </button>
                  <button
                    type="button"
                    className={`${styles.schedulePresetBtn} ${
                      selectedDays.length === 7 && allHours ? styles.presetActive : ''
                    }`}
                    onClick={() => {
                      setSelectedDays(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
                      setStartHour(0);
                      setEndHour(24);
                      setAllHours(true);
                    }}
                  >
                    🌟 24/7 Always On (All Week)
                  </button>
                </div>

                {/* Interactive Day-of-Week Pills */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground)' }}>
                      Active Days of the Week ({activeDaysCount} of 7 Selected)
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={selectAllDays}
                        className={styles.quickDayLink}
                      >
                        All 7 Days
                      </button>
                      <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>·</span>
                      <button
                        type="button"
                        onClick={selectWeekdays}
                        className={styles.quickDayLink}
                      >
                        Mon–Fri
                      </button>
                    </div>
                  </div>

                  <div className={styles.daysGrid}>
                    {DAY_LABELS.map((day) => {
                      const isSel = selectedDays.includes(day.key);
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => toggleDay(day.key)}
                          className={`${styles.dayBtn} ${isSel ? styles.dayBtnActive : ''}`}
                          title={`Toggle ${day.label}`}
                        >
                          <span className={styles.dayShort}>{day.short}</span>
                          <span className={styles.dayState}>{isSel ? '✓' : '−'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Hours Configuration */}
                <div className={styles.hoursConfigBox}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--foreground)' }}>
                      Active Ad Hours
                    </label>
                    <label className={styles.allHoursToggleLabel}>
                      <input
                        type="checkbox"
                        checked={allHours}
                        onChange={(e) => setAllHours(e.target.checked)}
                        style={{ accentColor: 'var(--accent, #f97316)', cursor: 'pointer' }}
                      />
                      <span>Run 24 Hours on Active Days</span>
                    </label>
                  </div>

                  {!allHours ? (
                    <div className={styles.timeRangeGrid}>
                      <div>
                        <label
                          htmlFor="start-bidding-hour"
                          style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}
                        >
                          Start Bidding At:
                        </label>
                        <select
                          id="start-bidding-hour"
                          aria-label="Start bidding hour"
                          value={startHour}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setStartHour(val);
                            if (val >= endHour) setEndHour(Math.min(24, val + 1));
                          }}
                          className={styles.timeSelect}
                        >
                          {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                            <option key={h} value={h}>
                              {formatHourLabel(h)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="stop-bidding-hour"
                          style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block', marginBottom: '0.25rem' }}
                        >
                          Stop Bidding At:
                        </label>
                        <select
                          id="stop-bidding-hour"
                          aria-label="Stop bidding hour"
                          value={endHour}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEndHour(val);
                            if (val <= startHour) setStartHour(Math.max(0, val - 1));
                          }}
                          className={styles.timeSelect}
                        >
                          {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                            <option key={h} value={h}>
                              {formatHourLabel(h)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}

                  {/* Schedule Pacing Summary */}
                  <div className={styles.schedulePacingSummary}>
                    <div className={styles.pacingRow}>
                      <span>🗓️ Active Schedule:</span>
                      <strong>
                        {activeDaysCount === 7
                          ? 'Every Day (Mon–Sun)'
                          : selectedDays.map((d) => DAY_LABELS.find((l) => l.key === d)?.short).join(', ')}
                        {' · '}
                        {allHours ? '24 Hours' : `${formatHourLabel(startHour)} – ${formatHourLabel(endHour)}`}
                      </strong>
                    </div>
                    <div className={styles.pacingRow}>
                      <span>⚡ Concentrated Daily Pace:</span>
                      <strong style={{ color: 'var(--accent, #f97316)' }}>
                        ~${activeDaysPaceDaily.toFixed(2)} / active day
                      </strong>
                    </div>
                    <p className={styles.pacingNote}>
                      🛡️ Bidding automatically sleeps outside your selected hours, concentrating 100% of your click budget when you can answer calls.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 2 Stepper Row */}
              <div className={styles.tabStepperRow}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setConfigTab('plan')}
                  style={{ fontSize: '0.82rem', padding: '0.5rem 0.95rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <span>← Back to Plan &amp; Budget</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setConfigTab('focus_roi')}
                  style={{ fontSize: '0.82rem', padding: '0.5rem 1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <span>Continue to Focus &amp; ROI</span>
                  <span style={{ fontWeight: 800 }}>➔</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: FOCUS & ROI */}
          {configTab === 'focus_roi' && (
            <div>
              <div className="section-heading workspace-section-heading compact-heading" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <p className="eyebrow">Step 3 · Customization &amp; ROI</p>
                  <h2 style={{ fontSize: '1.25rem' }}>Campaign Focus &amp; Return Projections</h2>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '20px',
                    fontWeight: 700,
                    background: customFocus ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                    color: customFocus ? '#10b981' : 'var(--muted)',
                    border: customFocus ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.12)',
                  }}
                >
                  {customFocus ? '✨ Custom Focus Active' : '○ Standard Target'}
                </span>
              </div>

              {/* Smart Campaign Focus & Custom Offer (AI Smart Field) */}
              <div className={styles.customFocusSectionCard}>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.75rem', lineHeight: 1.45 }}>
                  Want to advertise something specific? Type a high-margin specialty, brand, or promotion below. Our AI comprehension engine verifies the exact intent before bidding to ensure your budget targets only relevant buyers.
                </p>

                <div className={styles.focusInputWrap}>
                  <input
                    id="custom-focus-input"
                    aria-label="Specific service, brand, or promotion to advertise"
                    type="text"
                    className={styles.focusInput}
                    placeholder={`e.g. Tankless Water Heater $500 Rebate, Generac Generators, $1,500 Off Full Roof...`}
                    value={customFocus}
                    onChange={(e) => setCustomFocus(e.target.value)}
                  />
                  {customFocus ? (
                    <button
                      type="button"
                      className={styles.clearFocusBtn}
                      onClick={() => setCustomFocus('')}
                      aria-label="Clear custom focus"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>

                {/* Quick Inspiration Pills */}
                <div className={styles.focusPillsRow}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600 }}>Quick Ideas:</span>
                  {[
                    '$1,500 Off Full Replacement',
                    'Emergency Same-Day Service',
                    'Generac Whole-Home Generators',
                    'Tankless Water Heater Rebate',
                    'Epoxy Floor Coating',
                  ].map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      className={styles.focusIdeaBtn}
                      onClick={() => setCustomFocus(idea)}
                    >
                      ✨ {idea}
                    </button>
                  ))}
                </div>

                {/* AI Real-Time Comprehension Confirmation Card */}
                {customFocus ? (
                  <div className={styles.aiComprehensionBox}>
                    <div className={styles.aiComprehensionHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>🧠</span>
                        <strong style={{ fontSize: '0.82rem', color: 'var(--foreground)' }}>
                          AI Comprehension &amp; Search Verification
                        </strong>
                      </div>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '12px',
                          background:
                            customFocusAnalysis.clarityVerdict === 'ready'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'rgba(245, 158, 11, 0.2)',
                          color: customFocusAnalysis.clarityVerdict === 'ready' ? '#10b981' : '#f59e0b',
                        }}
                      >
                        {customFocusAnalysis.clarityVerdict === 'ready'
                          ? '✓ AI Verified · Ready to Bid'
                          : '⚠️ Refine Query'}
                      </span>
                    </div>

                    <p className={styles.aiSummaryText}>{customFocusAnalysis.aiUnderstandingSummary}</p>

                    {/* Search Term & Waste Filter Verification Grid */}
                    <div className={styles.aiKeywordsVerificationGrid}>
                      <div className={styles.aiKwColumn}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#10b981',
                            display: 'block',
                            marginBottom: '0.35rem',
                          }}
                        >
                          🟢 Exact Buyer Searches We Will Bid On:
                        </span>
                        <div className={styles.kwPillsWrap}>
                          {customFocusAnalysis.targetBuyerSearches.slice(0, 4).map((kw) => (
                            <span key={kw} className={styles.kwPillTarget} style={{ fontSize: '0.72rem' }}>
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className={styles.aiKwColumn}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#ef4444',
                            display: 'block',
                            marginBottom: '0.35rem',
                          }}
                        >
                          🔴 Negative Keywords Filtered Out (Zero Waste):
                        </span>
                        <div className={styles.kwPillsWrap}>
                          {customFocusAnalysis.customNegativeFilters.slice(0, 4).map((neg) => (
                            <span key={neg} className={styles.kwPillNegative} style={{ fontSize: '0.72rem' }}>
                              - {neg}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {customFocusAnalysis.aiSuggestions.length > 0 &&
                    customFocusAnalysis.clarityVerdict !== 'ready' ? (
                      <div className={styles.aiSuggestionAlert}>
                        <span>💡</span>
                        <span>{customFocusAnalysis.aiSuggestions[0]}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Interactive ROI & Revenue Potential Calculator */}
              <div className={styles.roiCalcCard}>
                <div className={styles.roiHeader}>
                  <div>
                    <span className="eyebrow" style={{ color: 'var(--accent, #f97316)' }}>
                      Interactive Revenue Model
                    </span>
                    <h3 style={{ margin: '0.2rem 0', fontSize: '1.1rem' }}>
                      Projected Return on Ad Spend (ROAS)
                    </h3>
                  </div>
                  <button
                    type="button"
                    className={styles.weatherToggleBtn}
                    onClick={() => setWeatherSurgeSim(!weatherSurgeSim)}
                    title={
                      weatherSurge.budgetProtected
                        ? 'Bad Weather Budget Guard: Outdoor pacing protected during rain/storms'
                        : 'Simulate local weather conditions'
                    }
                  >
                    {!weatherSurgeSim
                      ? '☀️ Normal Weather'
                      : weatherSurge.surgeActive
                      ? `⛈️ Weather Surge (+${weatherSurge.recommendedBudgetBoostPct || 25}%)`
                      : weatherSurge.budgetProtected
                      ? '🛡️ Storm Delay (Budget Shield Active)'
                      : '☀️ Baseline Pacing'}
                  </button>
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.85rem' }}>
                  Adjust your typical project size and closing percentage. Projections use conservative local trade CPC benchmarks for verified, screened homeowners.
                </p>

                <div className={styles.roiSliders}>
                  <div className={styles.sliderBox}>
                    <div className={styles.sliderLabelRow}>
                      <span>Average Job Revenue</span>
                      <strong>${avgTicketDollars.toLocaleString()}</strong>
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={20000}
                      step={250}
                      value={avgTicketDollars}
                      onChange={(e) => setAvgTicketDollars(Number(e.target.value))}
                      className={styles.rangeInput}
                    />
                  </div>

                  <div className={styles.sliderBox}>
                    <div className={styles.sliderLabelRow}>
                      <span>Estimate Close Rate</span>
                      <strong>{closeRatePct}%</strong>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={50}
                      step={5}
                      value={closeRatePct}
                      onChange={(e) => setCloseRatePct(Number(e.target.value))}
                      className={styles.rangeInput}
                    />
                  </div>
                </div>

                {/* Net Estimated Monthly Profit Banner */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', padding: '0.45rem 0.75rem', marginBottom: '0.85rem' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--foreground)', fontWeight: 600 }}>
                    💰 Est. Net Revenue (Pipeline - Ad Budget):
                  </span>
                  <strong style={{ fontSize: '0.86rem', color: '#10b981' }}>
                    +${Math.max(0, roiMetrics.grossRevenue - (fundingModel === 'weekly_drip' ? currentBundle.monthlyAverageDollars : walletMaxMonthlySpendDollars)).toLocaleString()} / mo
                  </strong>
                </div>

                <div className={styles.roiResultsGrid}>
                  <div className={styles.roiResultBox}>
                    <span className={styles.roiResultLabel}>Est. Monthly Leads</span>
                    <strong className={styles.roiResultValue}>{roiMetrics.effectiveLeads}</strong>
                    <span className={styles.roiResultSub}>Pre-qualified local calls/forms</span>
                  </div>
                  <div className={styles.roiResultBox}>
                    <span className={styles.roiResultLabel}>Est. Closed Jobs</span>
                    <strong className={styles.roiResultValue} style={{ color: '#10b981' }}>
                      {roiMetrics.wonJobs} Jobs
                    </strong>
                    <span className={styles.roiResultSub}>@ {closeRatePct}% close rate</span>
                  </div>
                  <div className={styles.roiResultBox}>
                    <span className={styles.roiResultLabel}>Projected Revenue</span>
                    <strong className={styles.roiResultValue} style={{ color: 'var(--accent, #f97316)' }}>
                      ${roiMetrics.grossRevenue.toLocaleString()}
                    </strong>
                    <span className={styles.roiResultSub}>Monthly pipeline value</span>
                  </div>
                  <div className={styles.roiResultBox}>
                    <span className={styles.roiResultLabel}>Projected ROAS</span>
                    <strong className={styles.roiResultValue} style={{ color: '#38bdf8' }}>
                      {roiMetrics.roas}x
                    </strong>
                    <span className={styles.roiResultSub}>Return on Ad Spend</span>
                  </div>
                </div>
              </div>

              {/* Export Blueprint & CSV Drawer */}
              <div style={{ marginTop: '1rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <strong style={{ fontSize: '0.8rem', color: 'var(--foreground)' }}>
                    Export Campaign Assets
                  </strong>
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                    Google Ads MCC Ready
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleDownloadCsv}
                    style={{ flex: 1, fontSize: '0.78rem', padding: '0.4rem' }}
                  >
                    {downloadedCsv ? '✓ CSV Ready' : 'Download Google Ads CSV'}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={handleCopyBlueprint}
                    style={{ flex: 1, fontSize: '0.78rem', padding: '0.4rem' }}
                  >
                    {copiedBlueprint ? '✓ Copied' : 'Copy Full Blueprint'}
                  </button>
                </div>
              </div>

              {/* Step 3 Stepper Row */}
              <div className={styles.tabStepperRow}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setConfigTab('schedule')}
                  style={{ fontSize: '0.82rem', padding: '0.5rem 0.95rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <span>← Back to Location &amp; Schedule</span>
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    const el = document.getElementById('campaign-launch-deck');
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                  }}
                  style={{ fontSize: '0.82rem', padding: '0.5rem 1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                >
                  <span>Review &amp; Launch Campaign</span>
                  <span style={{ fontWeight: 800 }}>➔</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Previews & 1-Click Launch */}
        <div style={{ position: 'sticky', top: '1rem' }}>
          {/* Live Preview Header Bar */}
          <div className={styles.livePreviewHeaderBar}>
            <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
              Multi-Channel Live Preview
            </span>
            <span className={styles.livePreviewPulsePill}>
              <span className={styles.livePreviewDot} />
              <span>Live Updates Active</span>
            </span>
          </div>

          {/* Multi-Channel Preview Switcher */}
          <div className={styles.deviceSwitcher}>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'mobile' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('mobile')}
            >
              <span>📱 Google</span>
            </button>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'desktop' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('desktop')}
            >
              <span>💻 Desktop</span>
            </button>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'meta' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('meta')}
            >
              <span>📸 Instagram</span>
            </button>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'retargeting' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('retargeting')}
            >
              <span>🎯 Retargeting</span>
            </button>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'sms' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('sms')}
            >
              <span>⚡ Auto-SMS</span>
            </button>
            <button
              type="button"
              className={`${styles.deviceBtn} ${previewPlatform === 'keywords' ? styles.active : ''}`}
              onClick={() => setPreviewPlatform('keywords')}
            >
              <span>🔍 Keywords</span>
            </button>
          </div>

          {/* 1. Google Search Previews */}
          {(previewPlatform === 'mobile' || previewPlatform === 'desktop') && (
            <div className={styles.serpContainer}>
              {/* Google Ads 10/10 Quality Score & Message-Match Readiness Card */}
              <div className={styles.qualityScoreCard}>
                <div className={styles.qualityScoreHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>🎯</span>
                    <div>
                      <strong className={styles.qualityScoreTitle}>
                        Google Ads Quality Score Readiness
                      </strong>
                      <span className={styles.qualityScoreSub}>
                        Tripartite auction health rating
                      </span>
                    </div>
                  </div>
                  <span className={styles.qualityScoreBadge}>
                    <span>★</span> 10/10 Quality Score
                  </span>
                </div>

                <div className={styles.qualityScoreGrid}>
                  <div className={styles.qualityScoreItem}>
                    <span className={styles.qualityScoreItemLabel}>Expected CTR</span>
                    <strong className={styles.qualityScoreItemValue}>
                      🟢 Above Average
                    </strong>
                    <span className={styles.qualityScoreItemSub}>Exact-intent matching</span>
                  </div>

                  <div className={styles.qualityScoreItem}>
                    <span className={styles.qualityScoreItemLabel}>Ad Relevance</span>
                    <strong className={styles.qualityScoreItemValue}>
                      🟢 Above Average
                    </strong>
                    <span className={styles.qualityScoreItemSub}>15 Responsive Headlines</span>
                  </div>

                  <div className={styles.qualityScoreItem}>
                    <span className={styles.qualityScoreItemLabel}>Landing Page Experience</span>
                    <strong className={styles.qualityScoreItemValue}>
                      🟢 Above Average
                    </strong>
                    <span className={styles.qualityScoreItemSub}>Sub-1s mobile speed</span>
                  </div>
                </div>

                {/* 100% Message-Match Flow Chain */}
                <div className={styles.messageMatchChainHeader}>
                  <span className={styles.messageMatchChainTitle}>
                    🔗 100% Message-Match Verification Chain:
                  </span>
                  <span className={styles.messageMatchChainSavings}>
                    Cuts CPC by up to 50%
                  </span>
                </div>

                <div className={styles.messageMatchChain}>
                  <div className={styles.messageMatchNode}>
                    <span className={styles.messageMatchNodeLabel}>1. Search Query</span>
                    <strong className={styles.messageMatchNodeValue}>{selectedServices[0] || trade} in {city.split(',')[0]}</strong>
                  </div>
                  <span className={styles.messageMatchArrow}>➔</span>
                  <div className={styles.messageMatchNode}>
                    <span className={styles.messageMatchNodeLabel}>2. Ad Headline</span>
                    <strong className={styles.messageMatchNodeValue}>{rsa.headlines[0] || `Top-Rated ${trade}`}</strong>
                  </div>
                  <span className={styles.messageMatchArrow}>➔</span>
                  <div className={styles.messageMatchNode}>
                    <span className={styles.messageMatchNodeLabel}>3. Landing Page</span>
                    <strong className={styles.messageMatchNodeValue}>Fast {selectedServices[0] || trade} in {city.split(',')[0]}</strong>
                  </div>
                  <span className={styles.messageMatchArrow}>➔</span>
                  <div className={styles.messageMatchNode}>
                    <span className={styles.messageMatchNodeLabel}>4. Intake CTA</span>
                    <strong className={styles.messageMatchNodeValue}>Get My Instant Quote</strong>
                  </div>
                </div>
              </div>

              {previewPlatform === 'mobile' ? (
                <div className={styles.mobileSearchBar}>
                  <span className={styles.googleG}>G</span>
                  <span className={styles.searchQueryMock}>{trade.toLowerCase()} near me</span>
                  <span className={styles.micIcon}>🎙️</span>
                </div>
              ) : null}

              <div className={styles.serpCard}>
                <div className={styles.serpHeader}>
                  <span className={styles.sponsoredBadge}>Sponsored</span>
                  <span className={styles.serpDot}>·</span>
                  <span className={styles.serpDomain}>{domain || 'yourbusiness.com'}</span>
                </div>

                <div className={styles.serpTitle}>
                  {rsa.headlines.slice(0, previewPlatform === 'mobile' ? 2 : 3).join(' | ')}
                </div>

                <div className={styles.serpRating}>
                  <span className={styles.stars}>★★★★★</span>
                  <span>4.9 · 85+ verified local reviews</span>
                </div>

                <div className={styles.serpDesc}>
                  {rsa.descriptions[0]} {previewPlatform === 'desktop' ? rsa.descriptions[1] : ''}
                </div>

                <div className={styles.sitelinksGrid}>
                  {rsa.sitelinks.slice(0, previewPlatform === 'mobile' ? 2 : 4).map((sitelink) => (
                    <div key={sitelink.title}>
                      <span className={styles.sitelinkTitle}>{sitelink.title}</span>
                      <span className={styles.sitelinkDesc}>{sitelink.desc}</span>
                    </div>
                  ))}
                </div>

                {phone ? (
                  previewPlatform === 'mobile' ? (
                    <div className={styles.mobileCallCta}>
                      <span>📞 Call {phone}</span>
                    </div>
                  ) : (
                    <div className={styles.desktopCallRow}>
                      <span>📞 Call now: {phone}</span>
                    </div>
                  )
                ) : null}
              </div>
            </div>
          )}

          {/* 2. Meta Post Preview */}
          {previewPlatform === 'meta' && (
            <div className={styles.metaCard}>
              <div className={styles.metaHeader}>
                <div className={styles.metaAvatar}>{businessName.slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className={styles.metaBusiness}>{businessName}</div>
                  <div className={styles.metaSub}>Sponsored · 🌐 {city}</div>
                </div>
              </div>

              <div className={styles.metaBody}>{metaAd.primaryText}</div>

              <div className={styles.metaMediaBox}>
                <span style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>🏠✨</span>
                <strong style={{ fontSize: '0.9rem' }}>{metaAd.visualHook}</strong>
                <span style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.2rem' }}>
                  Auto-synced from your completed jobs
                </span>
              </div>

              <div className={styles.metaFooter}>
                <div>
                  <div className={styles.metaHeadline}>{metaAd.headline}</div>
                  <div className={styles.metaDesc}>{metaAd.description}</div>
                </div>
                <button type="button" className={styles.metaCtaBtn}>
                  {metaAd.callToAction}
                </button>
              </div>
            </div>
          )}

          {/* 3. Retargeting Banner Preview */}
          {previewPlatform === 'retargeting' && (
            <div className={styles.bannerCard}>
              <span className={styles.bannerBadge}>{retargetingAd.offerBadge}</span>
              <div className={styles.bannerTitle}>{retargetingAd.headline}</div>
              <div className={styles.bannerDesc}>{retargetingAd.description}</div>
              <span className={styles.bannerCta}>{retargetingAd.cta} →</span>
            </div>
          )}

          {/* 4. Speed-to-Lead Auto-SMS Simulation */}
          {previewPlatform === 'sms' && (
            <div className={styles.smsDemoContainer}>
              <div className={styles.smsDemoHeader}>
                <div>
                  <strong>⚡ Speed-to-Lead Auto-SMS</strong>
                  <span className={styles.smsSub}>Instant AI engagement before rivals call</span>
                </div>
                <span className={styles.smsResponseBadge}>12s Response</span>
              </div>
              <div className={styles.smsStream}>
                <div className={styles.smsInbound}>
                  <div className={styles.smsMeta}>Homeowner Lead via Google Search Ad · 10:14 AM</div>
                  <div className={styles.smsBubble}>
                    Hi, I need an estimate for {selectedServices[0] || trade} at my home in {city.split(',')[0]}.
                  </div>
                </div>
                <div className={styles.smsOutbound}>
                  <div className={styles.smsMeta}>AI Autopilot · 10:14 AM (12s later)</div>
                  <div className={styles.smsBubble}>
                    Hi there! Thanks for contacting {businessName}. We received your request for {selectedServices[0] || trade} in {city.split(',')[0]}. Would tomorrow morning or afternoon work better for our estimator to take a look?
                  </div>
                </div>
                <div className={styles.smsInbound}>
                  <div className={styles.smsMeta}>Homeowner Reply · 10:15 AM</div>
                  <div className={styles.smsBubble}>
                    Tomorrow morning around 10am works great!
                  </div>
                </div>
                <div className={styles.smsOutbound}>
                  <div className={styles.smsMeta}>AI Autopilot · 10:15 AM</div>
                  <div className={styles.smsBubble}>
                    You’re all set for 10:00 AM tomorrow! We’ve assigned our specialist to your address and added it to our dispatch schedule.
                  </div>
                </div>
              </div>

              {/* Speed-to-Lead Response Time Benchmark Comparison */}
              <div className={styles.speedToLeadBenchmarkBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className={styles.benchmarkBoxTitle}>
                    ⚡ Speed-to-Lead Conversion Velocity Benchmark
                  </span>
                  <span className={styles.benchmarkAdvantageBadge}>
                    +391% Close Rate Advantage
                  </span>
                </div>

                <div className={styles.benchmarkRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                    <span className={styles.benchmarkFastLabel}>
                      ⚡ Let&apos;s Get Quoted AI Autopilot (12 Seconds)
                    </span>
                    <strong className={styles.benchmarkFastRate}>78% Lead-to-Appointment Rate</strong>
                  </div>
                  <div className={styles.benchmarkBar}>
                    <div className={styles.benchmarkBarFillFast} />
                  </div>
                </div>

                <div className={styles.benchmarkRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                    <span className={styles.benchmarkSlowLabel}>
                      🐢 Industry Average Contractor (42 Minutes)
                    </span>
                    <span className={styles.benchmarkSlowRate}>&lt;15% Lead-to-Appointment Rate</span>
                  </div>
                  <div className={styles.benchmarkBar}>
                    <div className={styles.benchmarkBarFillSlow} />
                  </div>
                </div>

                <p className={styles.benchmarkFootnote}>
                  *Source: Lead Response Management Study. Homeowners contacted within 60 seconds are 391% more likely to book an in-person estimate than those contacted after 30 minutes.
                </p>
              </div>
            </div>
          )}

          {/* 5. Keywords & Negative Waste Filter */}
          {previewPlatform === 'keywords' && (
            <div className={styles.keywordExplorerCard}>
              {/* Negative Keyword Waste Prevention Ticker & Dollar Savings Shield */}
              <div className={styles.negativeWasteTicker}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>🛡️</span>
                    <strong className={styles.negativeWasteTitle}>
                      100+ Negative Search Queries Scrubbed 24/7
                    </strong>
                  </div>
                  <span className={styles.wasteSavingsTag}>
                    💰 Saves ~$340–$620/mo in Wasted Clicks
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.4rem' }}>
                  <span className={styles.wasteCategoryPill}>🚫 DIY &amp; How-To</span>
                  <span className={styles.wasteCategoryPill}>🚫 Job Applicants</span>
                  <span className={styles.wasteCategoryPill}>🚫 Wholesale &amp; Parts</span>
                  <span className={styles.wasteCategoryPill}>🚫 Competitor Lookups</span>
                  <span className={styles.wasteCategoryPill}>🚫 Cheap / Free Search</span>
                </div>

                <p className={styles.negativeWasteText}>
                  Every search query is screened through our Master Negative List before bidding, preventing zero-intent clicks from eating your ad budget.
                </p>
              </div>

              <div style={{ marginBottom: '0.6rem' }}>
                <strong style={{ fontSize: '0.88rem', color: '#ffffff' }}>High-Intent Targeting vs. Negative Shield</strong>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Our AI bids exclusively on verified buyer searches and blocks non-revenue terms.
                </p>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <span className={styles.kwGroupTitle} style={{ color: '#10b981' }}>
                  🟢 Target Buyer Keywords ({allKeywords.length})
                </span>
                <div className={styles.kwPillsWrap}>
                  {allKeywords.slice(0, 8).map((kw) => (
                    <span key={kw} className={styles.kwPillTarget}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className={styles.kwGroupTitle} style={{ color: '#ef4444' }}>
                  🔴 Waste Blocked (Negative Keywords · {negativeKeywords.length})
                </span>
                <div className={styles.kwPillsWrap}>
                  {negativeKeywords.slice(0, 10).map((neg) => (
                    <span key={neg} className={styles.kwPillNegative}>
                      - {neg}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Campaign Launch Configuration Summary Deck */}
          <div id="campaign-launch-deck" className={styles.launchSummaryCard}>
            <div className={styles.launchSummaryHeader}>
              <span className={styles.launchSummaryTitle}>⚡ Campaign Launch Blueprint</span>
              <span className={styles.launchSummaryStatus}>
                ● Configured &amp; Ready
              </span>
            </div>

            <div className={styles.launchSummaryGrid}>
              <div className={styles.launchSummaryPill}>
                <span className={styles.launchSummaryPillLabel}>Selected Plan</span>
                <strong className={styles.launchSummaryPillValue}>
                  {fundingModel === 'weekly_drip'
                    ? `${currentBundle.name} · $${currentBundle.weeklyAmountDollars}/wk`
                    : `Wallet · $${walletDepositDollars} Dep`}
                </strong>
              </div>

              <div className={styles.launchSummaryPill}>
                <span className={styles.launchSummaryPillLabel}>Target Geo</span>
                <strong className={styles.launchSummaryPillValue}>
                  📍 {city.split(',')[0]} (±{radius}m)
                </strong>
              </div>

              <div className={styles.launchSummaryPill}>
                <span className={styles.launchSummaryPillLabel}>Active Days &amp; Hours</span>
                <strong className={styles.launchSummaryPillValue}>
                  🗓️ {activeDaysCount}d · {allHours ? '24h' : `${formatHourLabel(startHour)}–${formatHourLabel(endHour)}`}
                </strong>
              </div>

              <div className={styles.launchSummaryPill}>
                <span className={styles.launchSummaryPillLabel}>Projected Pipeline</span>
                <strong className={`${styles.launchSummaryPillValue} ${styles.launchSummaryPipeline}`}>
                  📈 ~{roiMetrics.effectiveLeads} Leads ({roiMetrics.roas}x ROAS)
                </strong>
              </div>
            </div>
          </div>

          {/* SMS Billing Alerts Opt-In Card with 2FA Phone Verification */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', textAlign: 'left' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={smsAlertsEnabled}
                onChange={(e) => setSmsAlertsEnabled(e.target.checked)}
                style={{ marginTop: '0.2rem', accentColor: '#10b981' }}
              />
              <div style={{ fontSize: '0.8rem' }}>
                <strong style={{ color: 'var(--foreground)' }}>📱 Send SMS billing alerts (24h before renewals &amp; on ad wallet refills)</strong>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--muted)', fontSize: '0.72rem' }}>
                  Get an automated text 24 hours before your renewal processes and immediately whenever an automatic ad top-up occurs.
                </p>
              </div>
            </label>
            {smsAlertsEnabled && (
              <div style={{ marginTop: '0.6rem', paddingLeft: '1.6rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>Alert Phone:</span>
                  <input
                    type="tel"
                    value={smsAlertPhone}
                    onChange={(e) => {
                      setSmsAlertPhone(e.target.value);
                      if (sms2faStatus === 'verified') {
                        setSms2faStatus('idle');
                      }
                    }}
                    placeholder="(555) 000-0000"
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '4px',
                      color: 'var(--foreground)',
                      width: '140px',
                    }}
                  />
                  {isPhoneVerified ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#10b981',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '12px',
                      }}
                      title="Number verified via 2FA OTP"
                    >
                      ✓ 2FA Verified
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSend2faCode}
                      disabled={sms2faStatus === 'sending' || sms2faCountdown > 0 || !smsAlertPhone.trim()}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '0.25rem 0.6rem',
                        borderRadius: '4px',
                        background: 'rgba(249, 115, 22, 0.2)',
                        border: '1px solid rgba(249, 115, 22, 0.4)',
                        color: '#f97316',
                        cursor: sms2faStatus === 'sending' || sms2faCountdown > 0 || !smsAlertPhone.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {sms2faStatus === 'sending'
                        ? 'Sending code…'
                        : sms2faStatus === 'sent'
                        ? sms2faCountdown > 0
                          ? `Resend in ${sms2faCountdown}s`
                          : 'Resend 2FA code'
                        : 'Verify # (2FA)'}
                    </button>
                  )}
                </div>

                {/* 2FA 6-Digit Verification Box */}
                {sms2faStatus === 'sent' && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(249, 115, 22, 0.35)',
                      borderRadius: '6px',
                      padding: '0.55rem 0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--foreground)' }}>
                        🔒 Enter 6-digit SMS verification code:
                      </span>
                      <small style={{ color: 'var(--muted)', fontSize: '0.68rem' }}>
                        Sent to {sms2faToken?.phone || smsAlertPhone}
                      </small>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={sms2faCode}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setSms2faCode(digits);
                          if (digits.length === 6 && sms2faToken) {
                            void handleVerify2faCode(digits);
                          }
                        }}
                        placeholder="123456"
                        autoFocus
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textAlign: 'center',
                          width: '95px',
                          padding: '0.25rem 0.4rem',
                          background: 'rgba(0,0,0,0.5)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '4px',
                          color: '#ffffff',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleVerify2faCode()}
                        disabled={sms2faCode.length !== 6 || verifying2fa}
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '0.28rem 0.65rem',
                          background: sms2faCode.length === 6 ? '#10b981' : 'rgba(255,255,255,0.1)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: sms2faCode.length === 6 ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {verifying2fa ? 'Verifying…' : 'Confirm 2FA'}
                      </button>
                    </div>
                    {sms2faError && (
                      <p style={{ color: '#ef4444', fontSize: '0.7rem', margin: '0.3rem 0 0' }}>
                        {sms2faError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {!MANAGED_ADS_CHECKOUT_ENABLED && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                fontSize: '0.8rem',
                color: '#f59e0b',
                lineHeight: 1.4,
              }}
            >
              <span>⚠️</span>
              <span>
                <strong>Managed Ads Checkout Paused:</strong> Self-service ad purchases are temporarily in private preview pending live advertiser account setup. Direct billing is currently inactive.
              </span>
            </div>
          )}

          {/* Primary 1-Click Launch Button */}
          <button
            type="button"
            className={styles.launchButton}
            onClick={handleLaunchAutopilot}
            disabled={checkoutLoading || !MANAGED_ADS_CHECKOUT_ENABLED}
            style={!MANAGED_ADS_CHECKOUT_ENABLED ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          >
            {checkoutLoading
              ? 'Connecting to Stripe...'
              : !MANAGED_ADS_CHECKOUT_ENABLED
                ? '⏸️ Managed Ads Checkout Paused (Private Preview)'
                : fundingModel === 'auto_refill_wallet'
                  ? `🚀 Fund Ad Wallet on Stripe ($${walletTotalDepositDollars} Initial Deposit)`
                  : `🚀 Launch Campaign on Stripe ($${currentBundle.weeklyAmountDollars}/wk)`}
          </button>

          <p style={{ fontSize: '0.74rem', color: 'var(--muted)', textAlign: 'center', margin: '0 0 0.5rem' }}>
            {fundingModel === 'auto_refill_wallet'
              ? `$${walletDepositDollars} direct ad click balance + $${walletFeeDollars} AI management fee. Auto-refills when balance <$${walletRefillThresholdDollars}. Hard capped at $${walletMaxMonthlySpendDollars}/mo. Cancel or pause anytime.`
              : `100% click budget deployed daily ($${currentBundle.weeklyAdSpendDollars}/wk ads + $${currentBundle.weeklyFeeDollars}/wk fee). Cancel or pause anytime with 1 click.`}
          </p>

          <div className={styles.securityGuarantees}>
            <span>🔒 Stripe SSL Encrypted</span>
            <span>⚡ Certified Google MCC</span>
            <span>🛡️ No Long-Term Contracts</span>
          </div>

          {/* 3-Point Onboarding Assurance Roadmap */}
          <div className={styles.onboardingTimelineCard}>
            <div className={styles.onboardingTimelineTitle}>
              <span>✨ What Happens After Launching</span>
            </div>
            <div className={styles.onboardingStepsList}>
              <div className={styles.onboardingStepItem}>
                <span className={styles.onboardingStepNum}>1</span>
                <div className={styles.onboardingStepText}>
                  <strong>Instant Stripe Checkout:</strong> 100% secure checkout with 1-click pause or cancel anytime.
                </div>
              </div>
              <div className={styles.onboardingStepItem}>
                <span className={styles.onboardingStepNum}>2</span>
                <div className={styles.onboardingStepText}>
                  <strong>24h Master Google MCC Setup:</strong> Geo-targeted Responsive Search Ads, sitelinks &amp; 100+ negative keyword shields deployed.
                </div>
              </div>
              <div className={styles.onboardingStepItem}>
                <span className={styles.onboardingStepNum}>3</span>
                <div className={styles.onboardingStepText}>
                  <strong>Sub-60s AI Speed-to-Lead:</strong> Incoming inquiries are texted within 12s to book appointments before competitors wake up.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COMPARTMENTALIZED KNOWLEDGE HUB */}
      <section className={styles.knowledgeHubCard}>
        <div className={styles.knowledgeHubHeader}>
          <div>
            <p className="eyebrow" style={{ color: 'var(--accent, #f97316)', marginBottom: '0.2rem' }}>
              Advertising Intelligence &amp; Blueprint
            </p>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
              {knowledgeTab === 'pipeline' && 'The 4-Stage Closed-Loop Customer Acquisition Engine'}
              {knowledgeTab === 'comparison' && 'Let’s Get Quoted Autopilot vs. Traditional Agencies'}
              {knowledgeTab === 'lsa_dual' && 'The Google Dominance Trifecta: Search Ads, Local Services & Google Maps 3-Pack'}
              {knowledgeTab === 'timeline' && 'Campaign Maturity: What to Expect Over Your First 90 Days'}
              {knowledgeTab === 'shields' && 'AI Smart Shield Trio: Zero Wasted Dollars'}
              {knowledgeTab === 'faq' && 'Frequently Asked Questions (FAQs)'}
            </h2>
          </div>

          <div className={styles.knowledgeHubNav} role="tablist">
            <button
              type="button"
              className={`${styles.knowledgeHubTabBtn} ${knowledgeTab === 'pipeline' ? styles.knowledgeHubTabBtnActive : ''}`}
              onClick={() => setKnowledgeTab('pipeline')}
            >
              🚀 4-Stage Engine
            </button>
            <button
              type="button"
              className={`${styles.knowledgeHubTabBtn} ${knowledgeTab === 'comparison' ? styles.knowledgeHubTabBtnActive : ''}`}
              onClick={() => setKnowledgeTab('comparison')}
            >
              📊 Agency Comparison
            </button>
            <button
              type="button"
              className={`${styles.knowledgeHubTabBtn} ${knowledgeTab === 'lsa_dual' ? styles.knowledgeHubTabBtnActive : ''}`}
              onClick={() => setKnowledgeTab('lsa_dual')}
            >
              🎯 Google Trifecta (Ads + LSA + GBP)
            </button>
            <button
              type="button"
              className={`${styles.knowledgeHubTabBtn} ${knowledgeTab === 'timeline' ? styles.knowledgeHubTabBtnActive : ''}`}
              onClick={() => setKnowledgeTab('timeline')}
            >
              🗓️ 90-Day Timeline
            </button>
            <button
              type="button"
              className={`${styles.knowledgeHubTabBtn} ${knowledgeTab === 'shields' ? styles.knowledgeHubTabBtnActive : ''}`}
              onClick={() => setKnowledgeTab('shields')}
            >
              🛡️ Smart Shields
            </button>
            <button
              type="button"
              className={`${styles.knowledgeHubTabBtn} ${knowledgeTab === 'faq' ? styles.knowledgeHubTabBtnActive : ''}`}
              onClick={() => setKnowledgeTab('faq')}
            >
              ❓ FAQs
            </button>
          </div>
        </div>

        {/* Panel 1: The 4-Stage AI Launch Engine */}
        {knowledgeTab === 'pipeline' && (
          <div>
            <p className="page-intro" style={{ marginBottom: '1.25rem' }}>
              From the instant you activate your budget, our automated pipeline executes a closed-loop customer acquisition cycle.
            </p>
            <div className={styles.stepsGrid}>
              <div className={styles.stepCard}>
                <div className={styles.stepNumber}>01</div>
                <h3 className={styles.stepTitle}>Hour 0: Instant Google MCC Provisioning</h3>
                <p className={styles.stepDesc}>
                  Campaigns, exact radius geo-fencing, Responsive Search Ads, sitelinks, and 100+ negative keyword waste shields are programmatically generated and deployed to our Master Google Ads MCC.
                </p>
              </div>

              <div className={styles.stepCard}>
                <div className={styles.stepNumber}>02</div>
                <h3 className={styles.stepTitle}>Hour 1: Dynamic Message-Match Intake</h3>
                <p className={styles.stepDesc}>
                  When a local homeowner clicks your ad, your website dynamically matches their exact search query (e.g., “Emergency {selectedServices[0] || trade} in {city.split(',')[0]}”), increasing booking conversion rates by up to 40%.
                </p>
              </div>

              <div className={styles.stepCard}>
                <div className={styles.stepNumber}>03</div>
                <h3 className={styles.stepTitle}>Instant: Sub-60s Speed-to-Lead Auto-SMS</h3>
                <p className={styles.stepDesc}>
                  The moment an ad inquiry arrives, AI texts the lead in under 60 seconds with trade-specific questions, locking in estimate appointments on your calendar before competitors even check their voicemail.
                </p>
              </div>

              <div className={styles.stepCard}>
                <div className={styles.stepNumber}>04</div>
                <h3 className={styles.stepTitle}>Ongoing: Closed-Loop Revenue Sync</h3>
                <p className={styles.stepDesc}>
                  When you mark a quote signed in Let’s Get Quoted CRM, the actual dollar contract value feeds back into Google Smart Bidding algorithms to train Google’s AI to target higher-ticket homeowners.
                </p>
              </div>
            </div>

            {/* Closed-Loop Revenue Synchronization Workflow */}
            <div className={styles.revenueLoopFlow}>
              <div className={styles.revenueLoopStep}>
                <span className={styles.revenueLoopIcon}>🔍</span>
                <span className={styles.revenueLoopTitle}>1. Local Search</span>
                <span className={styles.revenueLoopSub}>High-intent homeowner clicks Google ad</span>
              </div>
              <span className={styles.revenueLoopArrow}>➔</span>
              <div className={styles.revenueLoopStep}>
                <span className={styles.revenueLoopIcon}>🌐</span>
                <span className={styles.revenueLoopTitle}>2. Instant Match</span>
                <span className={styles.revenueLoopSub}>Website dynamically matches exact query</span>
              </div>
              <span className={styles.revenueLoopArrow}>➔</span>
              <div className={styles.revenueLoopStep}>
                <span className={styles.revenueLoopIcon}>⚡</span>
                <span className={styles.revenueLoopTitle}>3. AI Speed-to-Lead</span>
                <span className={styles.revenueLoopSub}>Lead texted in &lt;12s to lock appointment</span>
              </div>
              <span className={styles.revenueLoopArrow}>➔</span>
              <div className={styles.revenueLoopStep}>
                <span className={styles.revenueLoopIcon}>📝</span>
                <span className={styles.revenueLoopTitle}>4. Signed Quote</span>
                <span className={styles.revenueLoopSub}>Homeowner signs high-ticket contract</span>
              </div>
              <span className={styles.revenueLoopArrow}>➔</span>
              <div className={styles.revenueLoopStep}>
                <span className={styles.revenueLoopIcon}>🔄</span>
                <span className={styles.revenueLoopTitle}>5. Closed-Loop Sync</span>
                <span className={styles.revenueLoopSub}>Revenue value trains Google Smart Bidding</span>
              </div>
            </div>
          </div>
        )}

        {/* Panel 2: Head-to-Head Agency Comparison */}
        {knowledgeTab === 'comparison' && (
          <div>
            <p className="page-intro" style={{ marginBottom: '1.25rem' }}>
              See why contractors are replacing expensive marketing retainers with automated AI campaigns.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.compTable}>
                <thead>
                  <tr>
                    <th>Deliverable / Cost Factor</th>
                    <th>Traditional Marketing Agency</th>
                    <th style={{ color: 'var(--accent, #f97316)' }}>Let’s Get Quoted AI Autopilot</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.metric}>
                      <td>
                        <strong>{row.metric}</strong>
                      </td>
                      <td className={styles.agencyCell}>{row.agency}</td>
                      <td className={styles.lgqCell}>
                        <span style={{ color: '#10b981', marginRight: '0.35rem' }}>✓</span>
                        <strong>{row.lgq}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Panel 3: The Google Dominance Trifecta Hub (Search Ads + LSA + GBP 3-Pack) */}
        {knowledgeTab === 'lsa_dual' && (
          <div className={styles.lsaSynergyCard}>
            <p className="page-intro" style={{ marginBottom: '1.25rem' }}>
              How Google Search Ads, Google Guaranteed (LSA), and your Google Business Profile work together to establish total local market dominance.
            </p>

            <div className={styles.googleTrifectaGrid}>
              {/* Column 1: Google Guaranteed (LSA) */}
              <div className={styles.trifectaCol}>
                <div className={styles.lsaColHeader}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 800, textTransform: 'uppercase' }}>
                      Pillar 1 · Pay-Per-Lead
                    </span>
                    <h3 style={{ fontSize: '1.05rem', margin: '0.2rem 0 0' }}>Google Guaranteed (LSA)</h3>
                  </div>
                  <span style={{ fontSize: '1.4rem' }}>🛡️</span>
                </div>

                <ul className={styles.lsaFeatureList}>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Pricing:</strong> Flat fee per qualified call ($35–$95/lead).</span>
                  </li>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Placement:</strong> Absolute top 3-pack with verified green badge.</span>
                  </li>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Intent:</strong> Immediate urgency homeowners looking to phone someone right now.</span>
                  </li>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Protection:</strong> Invalid call dispute credits for wrong-service inquiries.</span>
                  </li>
                </ul>
              </div>

              {/* Column 2: Google Search Ads */}
              <div className={styles.trifectaCol}>
                <div className={styles.lsaColHeader}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase' }}>
                      Pillar 2 · Smart Bidding
                    </span>
                    <h3 style={{ fontSize: '1.05rem', margin: '0.2rem 0 0' }}>Google Search Ads (PPC)</h3>
                  </div>
                  <span style={{ fontSize: '1.4rem' }}>💻</span>
                </div>

                <ul className={styles.lsaFeatureList}>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Pricing:</strong> Pay-Per-Click with AI Smart Bidding value maximization.</span>
                  </li>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Placement:</strong> Top Sponsored RSA with sitelinks &amp; review extensions.</span>
                  </li>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Intent:</strong> High-ticket project shoppers ($1,500–$15,000+ remodel &amp; replacement).</span>
                  </li>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Conversion:</strong> 100% Message-match landing page + &lt;12s Auto-SMS booking.</span>
                  </li>
                </ul>
              </div>

              {/* Column 3: Google Business Profile (GBP Maps 3-Pack) */}
              <div className={styles.trifectaCol}>
                <div className={styles.lsaColHeader}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#f97316', fontWeight: 800, textTransform: 'uppercase' }}>
                      Pillar 3 · Organic Maps
                    </span>
                    <h3 style={{ fontSize: '1.05rem', margin: '0.2rem 0 0' }}>Google Maps 3-Pack (GBP)</h3>
                  </div>
                  <span style={{ fontSize: '1.4rem' }}>📍</span>
                </div>

                <ul className={styles.lsaFeatureList}>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Pricing:</strong> $0 Click / Lead Cost (Compounding organic equity).</span>
                  </li>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Placement:</strong> Local Map 3-pack below search ads for geographic searches.</span>
                  </li>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Intent:</strong> Reputation &amp; proximity-driven local homeowners.</span>
                  </li>
                  <li className={styles.lsaFeatureItem}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓</span>
                    <span><strong>Flywheel:</strong> Automated post-job 5-star review collection boost.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* The 1-2-3 Google Dominance Synergy Banner */}
            <div className={styles.lsaSynergyBanner}>
              <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>🏆</span>
              <div>
                <strong style={{ fontSize: '0.95rem', color: 'var(--foreground)', display: 'block', marginBottom: '0.25rem' }}>
                  The 3-Pillar Google Dominance Synergy (Capturing up to 68% of Total Local Inbound Demand)
                </strong>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                  When contractors synchronize Google Search Ads, Google Guaranteed, and their Google Business Profile, they occupy <strong>every above-the-fold position on the first page of Google</strong>. Callers with emergency repairs tap Google Guaranteed, high-ticket quote shoppers click your search ad, and local reputation seekers choose your Google Maps listing.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Panel 4: Expected Campaign Milestones */}
        {knowledgeTab === 'timeline' && (
          <div>
            <p className="page-intro" style={{ marginBottom: '1.25rem' }}>
              Advertising compounding is real. Here is how your campaign matures over time.
            </p>
            <div className={styles.milestonesGrid}>
              <div className={styles.milestoneCard}>
                <span className={styles.milestonePill}>Month 1 · Weeks 1–4</span>
                <h3 className={styles.milestoneTitle}>Calibration &amp; Ingestion</h3>
                <ul className={styles.milestoneList}>
                  <li>Google AI maps local high-intent search queries in {city.split(',')[0]}</li>
                  <li>Negative search term scrubbing filters low-intent clicks</li>
                  <li>First wave of inbound phone calls and estimate form submissions</li>
                  <li>Baseline Cost Per Lead (CPL) established for your trade</li>
                </ul>
              </div>

              <div className={styles.milestoneCard}>
                <span className={styles.milestonePill} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#38bdf8' }}>
                  Month 2 · Weeks 5–8
                </span>
                <h3 className={styles.milestoneTitle}>Conversion Acceleration</h3>
                <ul className={styles.milestoneList}>
                  <li>Speed-to-Lead SMS accelerates appointment confirmation rate by 2x</li>
                  <li>Lost visitor retargeting banners re-engage bounced homeowners</li>
                  <li>Automated review collection boosts Google Quality Score</li>
                  <li>Average Cost Per Lead drops as CTR improves</li>
                </ul>
              </div>

              <div className={styles.milestoneCard}>
                <span className={styles.milestonePill} style={{ background: 'rgba(249, 115, 22, 0.15)', color: 'var(--accent, #f97316)' }}>
                  Month 3+ · Ongoing
                </span>
                <h3 className={styles.milestoneTitle}>Offline Revenue Scaling</h3>
                <ul className={styles.milestoneList}>
                  <li>Signed contract revenue feeds Google Smart Bidding algorithms</li>
                  <li>Google AI actively targets high-ticket remodel &amp; replacement jobs</li>
                  <li>Predictable weekly job pipeline and consistent crew utilization</li>
                  <li>Scale budget up or down with 1 click based on crew capacity</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Panel 4: AI Smart Shield Trio */}
        {knowledgeTab === 'shields' && (
          <div>
            <p className="page-intro" style={{ marginBottom: '1.25rem' }}>
              Three autonomous safeguards constantly monitor your environment to protect your budget and maximize every click.
            </p>
            <div className={styles.shieldCardsGrid}>
              <div className={styles.shieldFeatureCard}>
                <div className={styles.shieldIconLarge}>🌦️</div>
                <h3 className={styles.shieldTitle}>Weather Surge Radar</h3>
                <p className={styles.shieldText}>
                  Continuously monitors local radar for storms, high winds, and freezes in {city.split(',')[0]}. Automatically surges search bidding +25% for emergency-repair trades during peak demand, while shielding outdoor trades (painting, landscaping, concrete) with bad-weather budget preservation so ad spend is never wasted during rain delays.
                </p>
              </div>

              <div className={styles.shieldFeatureCard}>
                <div className={styles.shieldIconLarge}>🛑</div>
                <h3 className={styles.shieldTitle}>Fully-Booked Capacity Guard</h3>
                <p className={styles.shieldText}>
                  Integrates directly with your dispatch calendar. The second your team is booked solid for the week, ad bidding automatically pauses so you never spend a dime on leads you can’t service.
                </p>
              </div>

              <div className={styles.shieldFeatureCard}>
                <div className={styles.shieldIconLarge}>🛡️</div>
                <h3 className={styles.shieldTitle}>Negative Waste Filter</h3>
                <p className={styles.shieldText}>
                  Over 100+ negative search terms continuously scrubbed to block DIY searchers, job applicants, wholesale shoppers, and competitor name lookups, preserving 100% of your budget for paying homeowners.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Panel 5: Frequently Asked Questions Accordion */}
        {knowledgeTab === 'faq' && (
          <div>
            <p className="page-intro" style={{ marginBottom: '1.25rem' }}>
              Clear answers to the most common questions contractors have about our advertising autopilot.
            </p>
            <div className={styles.faqList}>
              {FAQS.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={faq.q} className={`${styles.faqItem} ${isOpen ? styles.faqOpen : ''}`}>
                    <button
                      type="button"
                      className={styles.faqHeaderBtn}
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    >
                      <span className={styles.faqQuestion}>{faq.q}</span>
                      <span className={styles.faqToggleIcon}>{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen ? <div className={styles.faqBody}>{faq.a}</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
