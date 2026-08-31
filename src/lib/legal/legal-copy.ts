// Pure, dependency-free generator for a contractor site's Privacy Policy and
// Terms of Service. It has NO project imports (mirrors src/lib/seo/seo-copy.ts)
// so it runs in the builder (client), the public routes (server), and the
// node --test suite alike. The output is the CONTRACTOR's policy — Let's Get
// Quoted is disclosed as the platform/service provider that powers the site
// and processes submissions. These are starter templates; the builder shows a
// "review before publishing / not legal advice" note to the owner.
//
// Output format is a tiny markdown subset the SiteLegalPage renderer parses:
//   "## Heading"  -> section heading
//   "- item"      -> bullet (consecutive bullets group into one list)
//   blank line     -> paragraph break

export type LegalInput = {
  companyName: string;
  location: string; // service area, e.g. "Metro Detroit"
  phone: string; // '' if not published
  updated: string; // YYYY-MM-DD, '' to omit the effective-date line
};

const PLATFORM = "Let's Get Quoted";

function clean(input: Partial<LegalInput>): LegalInput {
  return {
    companyName: (input.companyName || '').trim() || 'our company',
    location: (input.location || '').trim(),
    phone: (input.phone || '').trim(),
    updated: (input.updated || '').trim(),
  };
}

function effectiveLine(updated: string): string {
  return updated ? `Effective date: ${updated}\n\n` : '';
}

function contactLine(c: LegalInput): string {
  const bits = [`You can reach ${c.companyName} using the contact form on this website`];
  if (c.phone) bits.push(`or by phone at ${c.phone}`);
  return `${bits.join(' ')}.`;
}

const areaClause = (c: LegalInput) =>
  c.location ? ` serving ${c.location}` : '';

export function generatePrivacyPolicy(rawInput: Partial<LegalInput>): string {
  const c = clean(rawInput);
  return (
    `# Privacy Policy\n\n` +
    effectiveLine(c.updated) +
    `This Privacy Policy explains how ${c.companyName}${areaClause(c)} ("we," "us," or "our") collects, uses, and protects your information when you use this website. This site is built and operated on the ${PLATFORM} platform, which helps us run our website and manage the requests you send us.\n\n` +

    `## Information we collect\n\n` +
    `When you fill out a quote request, contact form, or instant-estimate tool, we collect the details you choose to provide, such as:\n\n` +
    `- Your name and contact details (phone number, and email address if you provide one)\n` +
    `- Your address or service area and the details of the job you're asking about\n` +
    `- Any photos, measurements, or notes you include with your request\n\n` +
    `We (and the ${PLATFORM} platform on our behalf) also automatically collect basic technical information your browser sends, such as your device type, general location, and pages viewed, to keep the site working and secure.\n\n` +

    `## How we use your information\n\n` +
    `We use the information you provide to:\n\n` +
    `- Respond to your request and give you a quote or estimate\n` +
    `- Analyze job descriptions and photos with AI assistance to evaluate scope, materials, and preliminary pricing\n` +
    `- Schedule and carry out the work you ask about\n` +
    `- Contact you about your request and send updates about your job\n` +
    `- Keep records, prevent fraud, and improve our service\n\n` +
    `We do not sell your personal information, and we never share or broadcast your inquiry to competing contractors or third-party lead brokers.\n\n` +

    `## Text messages and calls\n\n` +
    `If you give us your phone number, you agree that we (and the ${PLATFORM} platform on our behalf) may contact you by phone call or text message about your request and your job. Message and data rates may apply, and message frequency varies. You can opt out of text messages at any time by replying STOP, or ask us to stop calling by telling us directly. Opting out of messages will not affect work already scheduled.\n\n` +

    `## How we share your information\n\n` +
    `We share your information only as needed to operate our business and fulfill your request:\n\n` +
    `- With ${PLATFORM}, our website and customer-management platform, which stores your request and helps us respond, message you, and process payments\n` +
    `- With AI processing providers (OpenAI) to analyze project descriptions and photos for scope and estimate generation, strictly for processing without using your content for AI model training\n` +
    `- With email and messaging delivery services (such as Resend and telecom carriers) to route quotes, estimates, receipts, and appointment notifications\n` +
    `- With payment processors (such as Stripe) to securely process deposits or invoice payments\n` +
    `- With hosting and infrastructure providers solely to operate our website and services\n` +
    `- When required by law, or to protect our rights, safety, or property\n\n` +

    `## Payments\n\n` +
    `If you pay an invoice or deposit through a link we send you, your payment is processed by our third-party payment provider (Stripe). We do not store your full card number; the payment provider handles that securely.\n\n` +

    `## Cookies\n\n` +
    `This site uses a small number of cookies and similar technologies to keep the site functioning and to understand how it is used. You can control cookies through your browser settings.\n\n` +

    `## Your choices and rights\n\n` +
    `Depending on where you live, you may have the right to access, correct, or delete the personal information we hold about you, or to opt out of certain uses. To make a request, contact us using the details below and we will respond as required by applicable law.\n\n` +

    `## Data retention and security\n\n` +
    `We keep your information for as long as needed to respond to your request, complete your job, and meet our legal and record-keeping obligations, then delete or de-identify it. We and our platform use reasonable safeguards to protect your information, though no method of transmission over the internet is completely secure.\n\n` +

    `## Children's privacy\n\n` +
    `This site is intended for adults and is not directed to children under 13. We do not knowingly collect personal information from children.\n\n` +

    `## Changes to this policy\n\n` +
    `We may update this Privacy Policy from time to time. When we do, we will revise the effective date at the top of this page.\n\n` +

    `## Contact us\n\n` +
    `${contactLine(c)}`
  );
}

export function generateTermsOfService(rawInput: Partial<LegalInput>): string {
  const c = clean(rawInput);
  return (
    `# Terms of Service\n\n` +
    effectiveLine(c.updated) +
    `Welcome to the website of ${c.companyName}${areaClause(c)} ("we," "us," or "our"). By using this website and requesting a quote, estimate, or service, you agree to these Terms of Service. This site is provided using the ${PLATFORM} platform.\n\n` +

    `## Our services\n\n` +
    `This website lets you learn about our services and send us a request for a quote or estimate. Submitting a request does not create a binding contract or guarantee that we will take on your job. We will follow up to discuss the details.\n\n` +

    `## Quotes and estimates\n\n` +
    `Any price, range, or instant estimate shown on this site is a preliminary ballpark based on the information you provide. It is not a final, binding quote. Final pricing depends on an assessment of the actual work, and we will confirm it with you before any work begins.\n\n` +

    `## Your responsibilities\n\n` +
    `You agree to provide accurate and complete information when you contact us, and to use this website only for lawful purposes. You are responsible for the information you submit through our forms.\n\n` +

    `## Communications\n\n` +
    `By giving us your contact details, you agree that we may contact you by phone, text message, or email about your request and your job, as described in our Privacy Policy. You can opt out of text messages by replying STOP.\n\n` +

    `## Intellectual property\n\n` +
    `The content on this website — including our name, logo, text, and images we own — belongs to us or our licensors and may not be copied or reused without permission. Some images may be licensed stock photography.\n\n` +

    `## Third-party platform\n\n` +
    `This website and the tools on it are provided through the ${PLATFORM} platform. Your use of the site is also subject to the platform's operation, and certain features (such as messaging and payments) are handled by third-party providers.\n\n` +

    `## Disclaimers\n\n` +
    `This website and its content are provided "as is" without warranties of any kind. We do our best to keep information accurate and current, but we do not guarantee that everything on the site is error-free or always available.\n\n` +

    `## Limitation of liability\n\n` +
    `To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of this website. Nothing in these terms limits any rights you have that cannot legally be limited.\n\n` +

    `## Governing law\n\n` +
    `These Terms are governed by the laws of the state in which ${c.companyName} operates, without regard to its conflict-of-laws rules.\n\n` +

    `## Changes to these terms\n\n` +
    `We may update these Terms from time to time. Continued use of the website after changes take effect means you accept the updated Terms.\n\n` +

    `## Contact us\n\n` +
    `${contactLine(c)}`
  );
}

// The editable body wins when the owner has customized it; a blank body falls
// back to the freshly generated template (so links always resolve to real text).
export function resolveLegalDoc(saved: string, generated: string): string {
  return saved && saved.trim() ? saved : generated;
}
