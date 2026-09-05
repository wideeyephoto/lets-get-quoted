'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import MarketingNav from '../MarketingNav';
import {
  CAMPAIGN_LINK_PRESETS,
  buildCampaignUrl,
  buildCampaignQrSvg,
  isValidHttpUrl,
  slugifyCampaign,
  type CampaignLinkPresetId,
} from '@/lib/campaign-roi';
import { escapeHtml } from '@/lib/equipment-qr';
import {
  deleteTrackingCampaignAction,
  saveTrackingCampaignAction,
} from './actions';
import styles from './LinkBuilderScreen.module.css';

export type EnrichedTrackingCampaign = {
  id: string;
  shortCode: string;
  name: string;
  channelId: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  promo: string;
  destinationUrl: string;
  fullUrl: string;
  adSpend: number;
  visits: number;
  leads: number;
  wonJobs: number;
  revenue: number;
  roas: number;
  createdAt: string;
};

type Props = {
  defaultBaseUrl: string;
  businessName: string;
  rootDomain?: string;
  accountId?: string;
  basePath?: string;
  navOnly?: string[];
  initialCampaigns?: EnrichedTrackingCampaign[];
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat(undefined).format(num || 0);
}

function formatLocalDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fallbackCopyText(text: string): boolean {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

export default function LinkBuilderScreen({
  defaultBaseUrl,
  businessName,
  rootDomain = 'letsgetquoted.com',
  accountId = 'default',
  basePath = '/dashboard',
  navOnly,
  initialCampaigns = [],
}: Props) {
  const isDemo = basePath.startsWith('/demo') || accountId === 'demo';
  const storageKey = `lgq.saved_tracking_campaigns.${accountId}`;

  const [savedCampaigns, setSavedCampaigns] = useState<EnrichedTrackingCampaign[]>(initialCampaigns);

  // Restore/fallback for demo or offline mode
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (initialCampaigns.length === 0 || isDemo) {
            setSavedCampaigns(parsed);
          }
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [storageKey, isDemo, initialCampaigns.length]);

  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [selectedPresetId, setSelectedPresetId] = useState<CampaignLinkPresetId>('yard_sign');
  const [name, setName] = useState('Spring Yard Signs 2026');
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl || 'https://example.com');
  const [source, setSource] = useState('yard_sign');
  const [medium, setMedium] = useState('print_qr');
  const [campaign, setCampaign] = useState('spring_yard_signs_2026');
  const [content, setContent] = useState('');
  const [term, setTerm] = useState('');
  const [promo, setPromo] = useState('');
  const [adSpend, setAdSpend] = useState('');
  const [qrTarget, setQrTarget] = useState<'short' | 'full'>('short');
  const [hasCustomizedName, setHasCustomizedName] = useState(false);

  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<'all' | '30d' | 'quarter' | 'year'>('all');
  const [sortField, setSortField] = useState<'name' | 'date' | 'visits' | 'leads' | 'revenue' | 'roas'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Interactive feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modals
  const [deleteCandidate, setDeleteCandidate] = useState<EnrichedTrackingCampaign | null>(null);
  const [printCampaign, setPrintCampaign] = useState<EnrichedTrackingCampaign | null>(null);
  const [printFormat, setPrintFormat] = useState<'yard_sign' | 'door_hanger' | 'truck_decal' | 'equipment_sticker'>('yard_sign');
  const [printOfferLine, setPrintOfferLine] = useState('Scan with phone camera for an instant quote & $50 off');
  const [printPhone, setPrintPhone] = useState('');
  const [printCropMarks, setPrintCropMarks] = useState(true);

  const builderRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);


  const normalizedCampaignSlug = useMemo(() => {
    return slugifyCampaign(campaign) || slugifyCampaign(name) || 'campaign';
  }, [campaign, name]);

  const handleSelectPreset = (presetId: CampaignLinkPresetId) => {
    setSelectedPresetId(presetId);
    const preset = CAMPAIGN_LINK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    if (preset.category === 'onsite') {
      setSource('');
      setMedium('onsite');
      if (!hasCustomizedName) {
        setName(preset.name);
        setCampaign('');
        setPromo(preset.suggestedCampaign);
      }
    } else {
      setSource(preset.defaultSource);
      setMedium(preset.defaultMedium);
      if (!hasCustomizedName) {
        setName(preset.name);
        setCampaign(preset.suggestedCampaign);
        setPromo('');
      }
    }
  };

  const isBaseUrlValid = useMemo(() => isValidHttpUrl(baseUrl), [baseUrl]);

  const generatedFullUrl = useMemo(() => {
    if (!isBaseUrlValid) return '';
    return buildCampaignUrl({
      baseUrl,
      source: source.trim() || undefined,
      medium: medium.trim() || undefined,
      campaign: normalizedCampaignSlug,
      content: content.trim() || undefined,
      term: term.trim() || undefined,
      promo: promo.trim() || undefined,
    });
  }, [baseUrl, source, medium, normalizedCampaignSlug, content, term, promo, isBaseUrlValid]);

  const previewShortCode = useMemo(() => {
    if (editingId) {
      const match = savedCampaigns.find((c) => c.id === editingId);
      if (match) return match.shortCode;
    }
    return normalizedCampaignSlug.slice(0, 6) || 'c7x9k2';
  }, [editingId, savedCampaigns, normalizedCampaignSlug]);

  const previewShortUrl = useMemo(() => {
    return `https://${rootDomain}/r/${previewShortCode}`;
  }, [rootDomain, previewShortCode]);

  const activeBuilderUrl = qrTarget === 'short' ? previewShortUrl : generatedFullUrl;
  const qrSvg = useMemo(() => {
    if (!activeBuilderUrl) return '';
    return buildCampaignQrSvg(activeBuilderUrl, 200, name);
  }, [activeBuilderUrl, name]);

  const handleCopy = async (urlToCopy: string, idToMark = 'builder') => {
    if (!urlToCopy) return;
    let ok = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(urlToCopy);
        ok = true;
      } else {
        ok = fallbackCopyText(urlToCopy);
      }
    } catch {
      ok = fallbackCopyText(urlToCopy);
    }

    if (ok) {
      setCopiedId(idToMark);
      setTimeout(() => setCopiedId(null), 2500);
    } else {
      setAlertMessage('Could not copy automatically. Please copy the link manually.');
    }
  };

  const handleDownloadQr = (urlToEncode: string, filename = 'campaign') => {
    if (!urlToEncode) return;
    const svgContent = buildCampaignQrSvg(urlToEncode, 400, filename);
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${slugifyCampaign(filename) || 'campaign'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = (urlToEncode: string, filename = 'campaign') => {
    if (!urlToEncode) return;
    const svgString = buildCampaignQrSvg(urlToEncode, 512, filename);
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `qr-${slugifyCampaign(filename) || 'campaign'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    };

    img.src = url;
  };

  const openPrintModal = (camp: EnrichedTrackingCampaign) => {
    setPrintCampaign(camp);
  };

  const executePrint = () => {
    if (!printCampaign) return;
    const targetUrl = `https://${rootDomain}/r/${printCampaign.shortCode}`;
    const svg = buildCampaignQrSvg(targetUrl, 320, printCampaign.name);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setAlertMessage('Print window was blocked by your browser. Please allow popups for this site to print signs.');
      return;
    }

    const safeBusinessName = escapeHtml(businessName);
    const safeHeadline = escapeHtml(printOfferLine || 'Scan for an Instant Quote');
    const safeUrl = escapeHtml(targetUrl);
    const safePhone = escapeHtml(printPhone || '');

    const cropMarksHtml = printCropMarks
      ? '<div class="crop-mark top-left"></div><div class="crop-mark top-right"></div><div class="crop-mark bottom-left"></div><div class="crop-mark bottom-right"></div>'
      : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${safeBusinessName} - ${escapeHtml(printCampaign.name)}</title>
          <style>
            @page { size: auto; margin: 0.5in; }
            * { box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
              text-align: center;
              padding: 2rem;
              background: #fff;
              color: #0f172a;
            }
            .sign-sheet {
              position: relative;
              border: 3px solid #0f172a;
              border-radius: 16px;
              padding: 2.5rem 2rem;
              max-width: 480px;
              width: 100%;
              background: #fff;
            }
            .top-badge {
              font-size: 0.85rem;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              color: #0284c7;
              margin-bottom: 0.5rem;
            }
            h1 { font-size: 1.8rem; margin: 0 0 0.5rem; font-weight: 800; }
            p { color: #475569; margin: 0 0 1.5rem; font-size: 1.05rem; font-weight: 600; line-height: 1.4; }
            .qr-holder {
              display: inline-flex;
              padding: 12px;
              border: 2px solid #e2e8f0;
              border-radius: 12px;
              background: #fff;
              margin: 0 auto;
            }
            .short-url {
              font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
              font-size: 0.95rem;
              font-weight: 700;
              color: #0f172a;
              margin-top: 1rem;
              letter-spacing: 0.02em;
            }
            .phone-call {
              margin-top: 0.75rem;
              font-size: 0.95rem;
              font-weight: 700;
              color: #475569;
            }
            .crop-mark {
              position: absolute;
              width: 15px;
              height: 15px;
              border-color: #94a3b8;
              border-style: solid;
            }
            .top-left { top: -8px; left: -8px; border-width: 2px 0 0 2px; }
            .top-right { top: -8px; right: -8px; border-width: 2px 2px 0 0; }
            .bottom-left { bottom: -8px; left: -8px; border-width: 0 0 2px 2px; }
            .bottom-right { bottom: -8px; right: -8px; border-width: 0 2px 2px 0; }
            @media print {
              body { padding: 0; }
              .sign-sheet { border: 2px solid #000; }
            }
          </style>
        </head>
        <body>
          <div class="sign-sheet">
            ${cropMarksHtml}
            <div class="top-badge">${escapeHtml(printFormat.replace('_', ' '))}</div>
            <h1>${safeBusinessName}</h1>
            <p>${safeHeadline}</p>
            <div class="qr-holder">
              ${svg}
            </div>
            <div class="short-url">${safeUrl}</div>
            ${safePhone ? `<div class="phone-call">Or call: ${safePhone}</div>` : ''}
          </div>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setPrintCampaign(null);
  };

  const handleOpenNewBuilder = () => {
    setEditingId(null);
    setShowBuilder(true);
    setTimeout(() => {
      builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nameInputRef.current?.focus();
    }, 50);
  };

  const handleEditCampaign = (camp: EnrichedTrackingCampaign) => {
    setEditingId(camp.id);
    setName(camp.name);
    setBaseUrl(camp.destinationUrl || defaultBaseUrl);
    setSource(camp.source);
    setMedium(camp.medium);
    setCampaign(camp.campaign);
    setContent(camp.content || '');
    setTerm(camp.term || '');
    setPromo(camp.promo || '');
    setAdSpend(camp.adSpend > 0 ? String(camp.adSpend) : '');
    setSelectedPresetId((camp.channelId as CampaignLinkPresetId) || 'yard_sign');
    setHasCustomizedName(true);
    setShowBuilder(true);

    setTimeout(() => {
      builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nameInputRef.current?.focus();
    }, 50);
  };

  const handleSaveCampaign = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isBaseUrlValid) {
      setAlertMessage('Please provide a valid destination URL.');
      return;
    }

    if (!name.trim()) {
      setAlertMessage('Please enter a campaign display name.');
      return;
    }

    setIsSaving(true);
    setAlertMessage(null);

    const parsedAdSpend = Math.max(0, Number(adSpend) || 0);

    if (isDemo) {
      if (editingId) {
        setSavedCampaigns((prev) => {
          const next = prev.map((c) => {
            if (c.id === editingId) {
              const roas = parsedAdSpend > 0 ? Number((c.revenue / parsedAdSpend).toFixed(1)) : 0;
              return {
                ...c,
                name: name.trim(),
                destinationUrl: baseUrl.trim(),
                fullUrl: generatedFullUrl,
                source,
                medium,
                campaign: normalizedCampaignSlug,
                content,
                term,
                promo,
                adSpend: parsedAdSpend,
                roas,
              };
            }
            return c;
          });
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {}
          return next;
        });
      } else {
        const shortCode = normalizedCampaignSlug.slice(0, 6) || 'demo01';
        const newCamp: EnrichedTrackingCampaign = {
          id: `demo-${Date.now()}`,
          shortCode,
          name: name.trim(),
          channelId: selectedPresetId,
          source: source || 'yard_sign',
          medium: medium || 'print_qr',
          campaign: normalizedCampaignSlug,
          content,
          term,
          promo,
          destinationUrl: baseUrl.trim(),
          fullUrl: generatedFullUrl,
          adSpend: parsedAdSpend,
          visits: 0,
          leads: 0,
          wonJobs: 0,
          revenue: 0,
          roas: 0,
          createdAt: new Date().toISOString(),
        };

        setSavedCampaigns((prev) => {
          const next = [newCamp, ...prev];
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {}
          return next;
        });
      }

      setShowBuilder(false);
      setEditingId(null);
      setIsSaving(false);
      return;
    }

    try {
      const res = await saveTrackingCampaignAction({
        id: editingId || undefined,
        name: name.trim(),
        destinationUrl: baseUrl.trim(),
        channelId: selectedPresetId,
        source: source || 'yard_sign',
        medium: medium || 'print_qr',
        campaign: normalizedCampaignSlug,
        content: content || undefined,
        term: term || undefined,
        promo: promo || undefined,
        adSpend: parsedAdSpend,
      });

      if (!res.success || !res.link) {
        setAlertMessage(res.error || 'Failed to save tracking campaign.');
        setIsSaving(false);
        return;
      }

      const savedRow = res.link;
      if (editingId) {
        setSavedCampaigns((prev) =>
          prev.map((c) => {
            if (c.id === editingId) {
              const roas = parsedAdSpend > 0 ? Number((c.revenue / parsedAdSpend).toFixed(1)) : 0;
              return {
                ...c,
                name: savedRow.name,
                destinationUrl: savedRow.destination_url,
                fullUrl: savedRow.full_url,
                source: savedRow.source,
                medium: savedRow.medium,
                campaign: savedRow.campaign,
                content: savedRow.content || '',
                term: savedRow.term || '',
                promo: savedRow.promo || '',
                adSpend: parsedAdSpend,
                roas,
              };
            }
            return c;
          })
        );
      } else {
        const newCamp: EnrichedTrackingCampaign = {
          id: savedRow.id,
          shortCode: savedRow.short_code,
          name: savedRow.name,
          channelId: savedRow.channel_id,
          source: savedRow.source,
          medium: savedRow.medium,
          campaign: savedRow.campaign,
          content: savedRow.content || '',
          term: savedRow.term || '',
          promo: savedRow.promo || '',
          destinationUrl: savedRow.destination_url,
          fullUrl: savedRow.full_url,
          adSpend: Number(savedRow.ad_spend) || 0,
          visits: savedRow.scan_count || 0,
          leads: 0,
          wonJobs: 0,
          revenue: 0,
          roas: 0,
          createdAt: savedRow.created_at,
        };
        setSavedCampaigns((prev) => [newCamp, ...prev]);
      }

      setShowBuilder(false);
      setEditingId(null);
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : 'Error saving tracking link');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;

    if (isDemo) {
      setSavedCampaigns((prev) => {
        const next = prev.filter((c) => c.id !== deleteCandidate.id);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
      setDeleteCandidate(null);
      return;
    }

    try {
      const res = await deleteTrackingCampaignAction(deleteCandidate.id);
      if (!res.success) {
        setAlertMessage(res.error || 'Failed to delete tracking campaign.');
      } else {
        setSavedCampaigns((prev) => prev.filter((c) => c.id !== deleteCandidate.id));
      }
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : 'Error deleting tracking link');
    } finally {
      setDeleteCandidate(null);
    }
  };

  const handleExportCsv = () => {
    if (savedCampaigns.length === 0) return;

    const headers = [
      'Name',
      'Short Code',
      'Short URL',
      'Destination URL',
      'Full Tracking URL',
      'Channel',
      'Source',
      'Medium',
      'Campaign Slug',
      'Content',
      'Ad Spend ($)',
      'Visits/Scans',
      'Leads',
      'Won Jobs',
      'Attributed Revenue ($)',
      'ROAS',
      'Created Date',
    ];

    const rows = savedCampaigns.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.shortCode}"`,
      `"https://${rootDomain}/r/${c.shortCode}"`,
      `"${c.destinationUrl}"`,
      `"${c.fullUrl}"`,
      `"${c.channelId}"`,
      `"${c.source}"`,
      `"${c.medium}"`,
      `"${c.campaign}"`,
      `"${(c.content || '').replace(/"/g, '""')}"`,
      c.adSpend.toFixed(2),
      c.visits,
      c.leads,
      c.wonJobs,
      c.revenue.toFixed(2),
      c.roas > 0 ? `${c.roas}x` : 'N/A',
      `"${formatLocalDate(c.createdAt)}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracking-campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered and sorted campaigns
  const filteredCampaigns = useMemo(() => {
    let result = [...savedCampaigns];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.campaign.toLowerCase().includes(q) ||
          c.shortCode.toLowerCase().includes(q) ||
          c.source.toLowerCase().includes(q) ||
          c.medium.toLowerCase().includes(q) ||
          c.destinationUrl.toLowerCase().includes(q)
      );
    }

    // Channel filter
    if (channelFilter !== 'all') {
      result = result.filter((c) => c.channelId === channelFilter || c.source === channelFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      let limitMs = 30 * dayMs;
      if (dateFilter === 'quarter') limitMs = 90 * dayMs;
      if (dateFilter === 'year') limitMs = 365 * dayMs;

      result = result.filter((c) => {
        const createdMs = new Date(c.createdAt).getTime();
        return now - createdMs <= limitMs;
      });
    }

    // Sorting
    result.sort((a, b) => {
      let valA: string | number = 0;
      let valB: string | number = 0;

      if (sortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortField === 'date') {
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
      } else if (sortField === 'visits') {
        valA = a.visits;
        valB = b.visits;
      } else if (sortField === 'leads') {
        valA = a.leads;
        valB = b.leads;
      } else if (sortField === 'revenue') {
        valA = a.revenue;
        valB = b.revenue;
      } else if (sortField === 'roas') {
        valA = a.roas;
        valB = b.roas;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [savedCampaigns, searchQuery, channelFilter, dateFilter, sortField, sortOrder]);

  const totalVisits = savedCampaigns.reduce((acc, c) => acc + c.visits, 0);
  const totalLeads = savedCampaigns.reduce((acc, c) => acc + c.leads, 0);
  const totalWonJobs = savedCampaigns.reduce((acc, c) => acc + c.wonJobs, 0);
  const totalRevenue = savedCampaigns.reduce((acc, c) => acc + c.revenue, 0);
  const totalSpend = savedCampaigns.reduce((acc, c) => acc + (c.adSpend || 0), 0);
  const overallRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(1) : '0.0';

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      {/* Header */}
      <section className="workspace-hero panel marketing-hero" style={{ marginBottom: '1rem' }}>
        <div className={styles.heroRow}>
          <div className="workspace-hero-copy" style={{ margin: 0 }}>
            <p className="eyebrow">Campaign Tracking &amp; Offline QR</p>
            <h1 className="workspace-title" style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>
              Tracking
            </h1>
            <p className="workspace-lead" style={{ margin: 0, fontSize: '0.9rem' }}>
              Create trackable links, QR codes, and short links for yard signs, truck wraps, flyers, and digital ads.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {savedCampaigns.length > 0 && (
              <button
                type="button"
                className="btn secondary"
                onClick={handleExportCsv}
                title="Export campaigns as CSV"
              >
                📥 Export CSV
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (showBuilder) {
                  setShowBuilder(false);
                  setEditingId(null);
                } else {
                  handleOpenNewBuilder();
                }
              }}
              aria-expanded={showBuilder}
              aria-controls="tracking-builder-section"
              style={{ fontWeight: 700 }}
            >
              {showBuilder ? '✕ Close Builder' : '+ New Tracking Link'}
            </button>
          </div>
        </div>
      </section>

      {/* Cross-Link Banner */}
      <div className={styles.crossLinkBanner}>
        <span>
          📊 <strong>Closed-Loop ROI:</strong> Track overall channel win rates, ad wallet balances, and performance in our analytics hub.
        </span>
        <Link href={`${basePath}/marketing/performance`} style={{ whiteSpace: 'nowrap' }}>
          View Channel ROI &amp; Performance →
        </Link>
      </div>

      {alertMessage && (
        <div className={styles.alertNotice} role="alert">
          {alertMessage}
          <button
            type="button"
            onClick={() => setAlertMessage(null)}
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            aria-label="Dismiss alert"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Results Summary Tiles */}
      <div className="mkt-tiles" style={{ marginBottom: '1.25rem' }}>
        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Active Campaigns</span>
          <strong className="mkt-tile-value">{formatNumber(savedCampaigns.length)}</strong>
          <span className="mkt-tile-note">Tracked touchpoints</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Visits &amp; Scans</span>
          <strong className="mkt-tile-value">{formatNumber(totalVisits)}</strong>
          <span className="mkt-tile-note">Via /r/ short links &amp; QR</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Attributed Leads</span>
          <strong className="mkt-tile-value" style={{ color: 'var(--info, #0284c7)' }}>
            {formatNumber(totalLeads)}
          </strong>
          <span className="mkt-tile-note">Quote inquiries</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Won Jobs</span>
          <strong className="mkt-tile-value" style={{ color: 'var(--success, #10b981)' }}>
            {formatNumber(totalWonJobs)}
          </strong>
          <span className="mkt-tile-note">Closed revenue contracts</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Attributed Revenue</span>
          <strong className="mkt-tile-value">{formatCurrency(totalRevenue)}</strong>
          <span className="mkt-tile-note">
            {totalSpend > 0 ? `${overallRoas}x ROAS on ${formatCurrency(totalSpend)} spend` : 'Direct campaign revenue'}
          </span>
        </article>
      </div>

      {/* 2. Builder Section */}
      {showBuilder ? (
        <section
          ref={builderRef}
          id="tracking-builder-section"
          className="panel workspace-section-card"
          style={{ marginBottom: '1.25rem' }}
        >
          <div className="section-heading workspace-section-heading compact-heading">
            <div>
              <p className="eyebrow">{editingId ? 'Edit Touchpoint' : 'Creator'}</p>
              <h2>{editingId ? `Edit Campaign: ${name}` : 'Create New Tracking Link & QR'}</h2>
            </div>
            {editingId && (
              <button
                type="button"
                className="btn ghost btn-sm"
                onClick={() => {
                  setEditingId(null);
                  setName('Spring Yard Signs 2026');
                  setHasCustomizedName(false);
                }}
              >
                Switch to New Link
              </button>
            )}
          </div>

          <form onSubmit={handleSaveCampaign} className={styles.container}>
            {/* Left Column: Presets & Inputs */}
            <div>
              <fieldset className={styles.presetSection} role="radiogroup" aria-label="Promotion channel">
                <legend className={styles.legend}>1. Choose a promotion channel preset</legend>
                <div className={styles.presetGrid}>
                  {CAMPAIGN_LINK_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={selectedPresetId === preset.id}
                      className={`${styles.presetCard} ${selectedPresetId === preset.id ? styles.active : ''}`}
                      onClick={() => handleSelectPreset(preset.id)}
                    >
                      <div className={styles.presetHead}>
                        <span aria-hidden="true">{preset.icon}</span>
                        <span>{preset.name}</span>
                      </div>
                      <span className={styles.presetDesc}>{preset.description}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className={styles.formGrid}>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label htmlFor="campaign-name">Campaign Display Name</label>
                  <input
                    ref={nameInputRef}
                    id="campaign-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setHasCustomizedName(true);
                      if (!editingId) {
                        setCampaign(slugifyCampaign(e.target.value));
                      }
                    }}
                    placeholder="e.g. Spring Yard Signs 2026"
                  />
                  <span className={styles.fieldHint}>
                    Reporting label. Normalized URL slug:{' '}
                    <code className={styles.slugPreview}>{normalizedCampaignSlug}</code>
                  </span>
                </div>

                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label htmlFor="base-url">Destination Page URL</label>
                  <input
                    id="base-url"
                    type="url"
                    required
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://yourbusiness.com/estimate"
                  />
                  {!isBaseUrlValid && baseUrl.trim() && (
                    <span className={styles.errorText}>
                      Please enter a valid website URL starting with https:// or http://
                    </span>
                  )}
                </div>

                <div className={styles.field}>
                  <label htmlFor="ad-spend">Ad / Print Spend ($)</label>
                  <input
                    id="ad-spend"
                    type="number"
                    min="0"
                    step="1"
                    value={adSpend}
                    onChange={(e) => setAdSpend(e.target.value)}
                    placeholder="e.g. 150 (Optional)"
                  />
                  <span className={styles.fieldHint}>Total dollar cost to compute exact ROAS.</span>
                </div>

                <div className={styles.field}>
                  <label htmlFor="utm-campaign">Campaign Tag (utm_campaign)</label>
                  <input
                    id="utm-campaign"
                    type="text"
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
                    placeholder="spring_yard_signs_2026"
                  />
                  <span className={styles.fieldHint}>Normalized tag passed to analytics and attribution.</span>
                </div>

                <details className="workspace-details" style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                  <summary className="workspace-details-summary">Advanced tracking parameters (UTM tags)</summary>
                  <div className={styles.formGrid} style={{ marginTop: '0.75rem' }}>
                    <div className={styles.field}>
                      <label htmlFor="utm-source">Source (utm_source)</label>
                      <input id="utm-source" value={source} onChange={(e) => setSource(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="utm-medium">Medium (utm_medium)</label>
                      <input id="utm-medium" value={medium} onChange={(e) => setMedium(e.target.value)} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="utm-content">Creative Variant (utm_content)</label>
                      <input
                        id="utm-content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="e.g. lawn_18x24, truck_side"
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="utm-term">Keyword (utm_term)</label>
                      <input
                        id="utm-term"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        placeholder="e.g. roof replacement"
                      />
                    </div>
                  </div>
                </details>
              </div>
            </div>

            {/* Right Column: Live Output & QR Preview */}
            <div className={styles.previewPanel}>
              <section className={styles.urlBox}>
                <div className={styles.urlHead}>
                  <span>1. Short Link (Sign-Ready)</span>
                  {copiedId === 'short' && <span className={styles.toastSuccess}>✓ Copied</span>}
                </div>
                <div className={styles.urlDisplay}>{previewShortUrl}</div>
                <div className={styles.urlActions}>
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => handleCopy(previewShortUrl, 'short')}
                  >
                    {copiedId === 'short' ? '✓ Copied' : 'Copy Short Link'}
                  </button>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)', alignSelf: 'center' }}>
                    Scans tracked &amp; 307-redirected
                  </span>
                </div>

                <div className={styles.urlHead} style={{ marginTop: '1rem' }}>
                  <span>2. Expanded Full Tracking URL</span>
                  {copiedId === 'full' && <span className={styles.toastSuccess}>✓ Copied</span>}
                </div>
                <div className={styles.urlDisplay}>{generatedFullUrl || 'Enter valid destination URL above'}</div>
                <div className={styles.urlActions}>
                  <button
                    type="button"
                    className="btn ghost btn-sm"
                    onClick={() => handleCopy(generatedFullUrl, 'full')}
                    disabled={!generatedFullUrl}
                  >
                    {copiedId === 'full' ? '✓ Copied' : 'Copy Full URL'}
                  </button>
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={isSaving || !isBaseUrlValid}
                    style={{ width: '100%', fontWeight: 700 }}
                  >
                    {isSaving ? 'Saving Touchpoint...' : editingId ? '💾 Update Touchpoint' : '💾 Save Tracking Touchpoint'}
                  </button>
                </div>
              </section>

              <section className={styles.qrBox}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${qrTarget === 'short' ? 'primary' : 'ghost'}`}
                    onClick={() => setQrTarget('short')}
                    style={{ fontSize: '0.75rem' }}
                  >
                    Encode Short URL (Dense/Fast)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${qrTarget === 'full' ? 'primary' : 'ghost'}`}
                    onClick={() => setQrTarget('full')}
                    style={{ fontSize: '0.75rem' }}
                  >
                    Encode Full URL
                  </button>
                </div>

                <div
                  className={styles.qrWrap}
                  role="img"
                  aria-label={`QR Code for campaign ${name}`}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <div className={styles.qrMeta}>
                  <strong>{name}</strong>
                  <span>Standards-compliant QR with 4-module quiet zone</span>
                </div>
                <div className={styles.qrActions}>
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => handleDownloadQr(activeBuilderUrl, name)}
                  >
                    Download SVG
                  </button>
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => handleDownloadPng(activeBuilderUrl, name)}
                  >
                    Download PNG
                  </button>
                  <button
                    type="button"
                    className="btn ghost btn-sm"
                    onClick={() => {
                      openPrintModal({
                        id: editingId || 'builder-preview',
                        shortCode: previewShortCode,
                        name,
                        channelId: selectedPresetId,
                        source,
                        medium,
                        campaign: normalizedCampaignSlug,
                        content,
                        term,
                        promo,
                        destinationUrl: baseUrl,
                        fullUrl: generatedFullUrl,
                        adSpend: Number(adSpend) || 0,
                        visits: 0,
                        leads: 0,
                        wonJobs: 0,
                        revenue: 0,
                        roas: 0,
                        createdAt: new Date().toISOString(),
                      });
                    }}
                  >
                    🖨️ Print Sign
                  </button>
                </div>
              </section>
            </div>
          </form>
        </section>
      ) : null}

      {/* 3. Saved Campaigns Table Section */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>Tracked Touchpoints ({savedCampaigns.length})</h2>
          </div>
        </div>

        {/* Search and Filters */}
        <div className={styles.tableToolbar}>
          <div className={styles.tableFilters}>
            <input
              type="search"
              className={styles.searchField}
              placeholder="Search campaigns, sources, codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search campaigns"
            />

            <select
              className={styles.filterSelect}
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              aria-label="Filter by channel"
            >
              <option value="all">All Channels</option>
              <option value="yard_sign">Yard Signs</option>
              <option value="truck_decal">Truck Decals</option>
              <option value="door_hanger">Door Hangers</option>
              <option value="google_ads">Google Ads</option>
              <option value="meta_ads">Meta Ads</option>
              <option value="nextdoor">Nextdoor</option>
              <option value="custom">Custom</option>
            </select>

            <select
              className={styles.filterSelect}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
              aria-label="Filter by date range"
            >
              <option value="all">All Time</option>
              <option value="30d">Last 30 Days</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Showing {filteredCampaigns.length} of {savedCampaigns.length}
          </div>
        </div>

        {savedCampaigns.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
            <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--foreground)' }}>
              No tracking touchpoints created yet
            </p>
            <p style={{ margin: '0.5rem 0 1.25rem', fontSize: '0.85rem' }}>
              Create your first trackable QR code or short link to measure exact jobs won from offline signs and ads.
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={handleOpenNewBuilder}
            >
              + Create First Tracking Link
            </button>
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--muted)' }}>
            <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600 }}>
              No touchpoints match your search or filter.
            </p>
            <button
              type="button"
              className="btn ghost btn-sm"
              onClick={() => {
                setSearchQuery('');
                setChannelFilter('all');
                setDateFilter('all');
              }}
              style={{ marginTop: '0.5rem' }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.campaignTable}>
              <thead>
                <tr>
                  <th scope="col" className={styles.sortableTh} onClick={() => toggleSort('name')}>
                    Campaign Name {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th scope="col">Short Link</th>
                  <th scope="col">Channel / Source</th>
                  <th scope="col" className={styles.sortableTh} onClick={() => toggleSort('visits')}>
                    Scans {sortField === 'visits' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th scope="col" className={styles.sortableTh} onClick={() => toggleSort('leads')}>
                    Leads {sortField === 'leads' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th scope="col" className={styles.sortableTh} onClick={() => toggleSort('revenue')}>
                    Won &amp; Revenue {sortField === 'revenue' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th scope="col" className={styles.sortableTh} onClick={() => toggleSort('roas')}>
                    Spend &amp; ROAS {sortField === 'roas' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((camp) => {
                  const shortUrl = `https://${rootDomain}/r/${camp.shortCode}`;
                  return (
                    <tr key={camp.id}>
                      <td>
                        <strong style={{ display: 'block', fontSize: '0.86rem', color: 'var(--foreground)' }}>
                          {camp.name}
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                          Created {formatLocalDate(camp.createdAt)} · <code>{camp.campaign}</code>
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <code style={{ fontSize: '0.76rem', color: 'var(--accent, #f97316)' }}>
                            /r/{camp.shortCode}
                          </code>
                          <button
                            type="button"
                            className="btn ghost btn-sm"
                            style={{ padding: '0.15rem 0.35rem', fontSize: '0.7rem' }}
                            onClick={() => handleCopy(shortUrl, camp.id)}
                            title="Copy Short Link"
                          >
                            {copiedId === camp.id ? '✓' : 'Copy'}
                          </button>
                        </div>
                      </td>

                      <td>
                        <span className={styles.badge}>
                          {camp.source} · {camp.medium}
                        </span>
                      </td>

                      <td style={{ fontWeight: 600 }}>{formatNumber(camp.visits)}</td>

                      <td>
                        <span className={styles.leadMetric}>{formatNumber(camp.leads)}</span>
                      </td>

                      <td>
                        <div className={styles.revenueMetric}>{formatCurrency(camp.revenue)}</div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                          {camp.wonJobs} won {camp.wonJobs === 1 ? 'job' : 'jobs'}
                        </span>
                      </td>

                      <td>
                        {camp.adSpend > 0 ? (
                          <div>
                            <span
                              className={`${styles.roasBadge} ${camp.roas >= 2.0 ? styles.roasHigh : styles.roasNeutral}`}
                            >
                              {camp.roas}x ROAS
                            </span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                              Cost: {formatCurrency(camp.adSpend)}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>No spend entered</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div className={styles.actionBtnGroup}>
                          <button
                            type="button"
                            className="btn ghost btn-sm"
                            onClick={() => handleEditCampaign(camp)}
                            title="Edit campaign touchpoint"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn ghost btn-sm"
                            onClick={() => handleDownloadQr(shortUrl, camp.name)}
                            title="Download SVG QR code"
                          >
                            SVG
                          </button>
                          <button
                            type="button"
                            className="btn ghost btn-sm"
                            onClick={() => handleDownloadPng(shortUrl, camp.name)}
                            title="Download PNG QR code"
                          >
                            PNG
                          </button>
                          <button
                            type="button"
                            className="btn ghost btn-sm"
                            onClick={() => openPrintModal(camp)}
                            title="Print physical sign sheet"
                          >
                            🖨️
                          </button>
                          <button
                            type="button"
                            className="btn ghost btn-sm"
                            style={{ color: 'var(--danger, #ef4444)' }}
                            onClick={() => setDeleteCandidate(camp)}
                            aria-label={`Delete campaign ${camp.name}`}
                            title="Delete campaign"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {deleteCandidate && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className={styles.modalCard}>
            <div className={styles.modalHead}>
              <h3 id="delete-title">Confirm Deletion</h3>
              <button
                type="button"
                className="btn ghost btn-sm"
                onClick={() => setDeleteCandidate(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>
                Are you sure you want to delete tracking touchpoint{' '}
                <strong>{deleteCandidate.name}</strong>?
              </p>
              <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.35rem' }}>
                Existing yard signs or links using short code <code>/r/{deleteCandidate.shortCode}</code> will no longer redirect to this campaign.
              </p>
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setDeleteCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ background: 'var(--danger, #ef4444)', borderColor: 'var(--danger, #ef4444)' }}
                onClick={handleConfirmDelete}
              >
                Delete Touchpoint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Sign Sheet Modal */}
      {printCampaign && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="print-title">
          <div className={styles.modalCard} style={{ maxWidth: '560px' }}>
            <div className={styles.modalHead}>
              <h3 id="print-title">Print Physical Collateral</h3>
              <button
                type="button"
                className="btn ghost btn-sm"
                onClick={() => setPrintCampaign(null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field} style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="print-format">Print Format Size</label>
                <select
                  id="print-format"
                  value={printFormat}
                  onChange={(e) => setPrintFormat(e.target.value as typeof printFormat)}
                >
                  <option value="yard_sign">Yard Sign (18″ × 24″)</option>
                  <option value="door_hanger">Door Hanger (4″ × 9″)</option>
                  <option value="truck_decal">Truck / Van Decal (12″ × 12″)</option>
                  <option value="equipment_sticker">Equipment Sticker (3″ × 2″)</option>
                </select>
              </div>

              <div className={styles.field} style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="print-offer">Offer / Call to Action Line</label>
                <input
                  id="print-offer"
                  type="text"
                  value={printOfferLine}
                  onChange={(e) => setPrintOfferLine(e.target.value)}
                  placeholder="e.g. Scan with your camera for an instant quote"
                />
              </div>

              <div className={styles.field} style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="print-phone">Phone Number (Optional)</label>
                <input
                  id="print-phone"
                  type="tel"
                  value={printPhone}
                  onChange={(e) => setPrintPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  id="crop-marks"
                  type="checkbox"
                  checked={printCropMarks}
                  onChange={(e) => setPrintCropMarks(e.target.checked)}
                />
                <label htmlFor="crop-marks" style={{ fontSize: '0.84rem' }}>
                  Include printer crop marks &amp; alignment guides
                </label>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setPrintCampaign(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={executePrint}
              >
                🖨️ Open Print Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
