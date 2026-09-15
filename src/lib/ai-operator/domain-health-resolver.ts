import 'server-only';
import { Resolver } from 'dns/promises';
import { callModel } from '@/lib/ai-model-call';
import { normalizeDomain } from '@/lib/domains';

export interface DomainHealthDiagnostics {
  domain: string;
  dnsRecords: {
    A: string[];
    CNAME: string[];
    TXT: string[];
    MX: string[];
  };
  aiDiagnosis: string;
}

export async function diagnoseDomainHealth(domainValue: string): Promise<DomainHealthDiagnostics> {
  const domain = normalizeDomain(domainValue);
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  
  const [aRecords, cnameRecords, txtRecords, mxRecords] = await Promise.all([
    resolver.resolve4(domain).catch(() => [] as string[]),
    resolver.resolveCname(domain).catch(() => [] as string[]),
    resolver.resolveTxt(domain).catch(() => [] as string[][]),
    resolver.resolveMx(domain).catch(() => [] as any[]),
  ]);

  const flatTxt = txtRecords.map(t => t.join(''));

  const dnsState = {
    A: aRecords,
    CNAME: cnameRecords,
    TXT: flatTxt,
    MX: mxRecords.map(mx => `${mx.exchange} (priority ${mx.priority})`),
  };

  const systemPrompt = `
You are a DNS and Domain Health Expert for Let's Get Quoted.
Our expected configurations:
- CNAME for WWW/subdomains should point to domains.letsgetquoted.com
- A Record for Apex domains should point to 76.76.21.21
- Email domains should have appropriate SPF (v=spf1 include:sendgrid.net ~all or similar) and DKIM/DMARC.

Diagnose the following DNS state for the domain "${domain}".
List exactly what is misconfigured in a single transaction-like step-by-step remediation plan for the contractor.
State what registrar changes are needed. Do not use the word "atomically".
`.trim();

  try {
    const response = await callModel({
      model: 'gemini-1.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(dnsState, null, 2) }
      ],
      temperature: 0.2
    }, { purpose: 'operations', accountId: 'operator-system' } as any);

    let diagnosis = 'Diagnosis completed successfully.';
    if (response.ok) {
      const data = await response.json() as any;
      // Depending on if the provider exposes OpenAI-compatible or direct Gemini
      diagnosis = data?.choices?.[0]?.message?.content || data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No diagnosis generated.';
    } else {
      diagnosis = `Provider error: ${response.status}`;
    }

    return {
      domain,
      dnsRecords: dnsState,
      aiDiagnosis: diagnosis,
    };
  } catch (error: any) {
    return {
      domain,
      dnsRecords: dnsState,
      aiDiagnosis: `Error generating diagnosis: ${error.message}`,
    };
  }
}
