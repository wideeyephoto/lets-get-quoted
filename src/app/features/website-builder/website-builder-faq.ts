import { PUBLIC_PRICING_SUMMARY } from '@/lib/pricing';

export interface WebsiteBuilderFaqItem {
  q: string;
  a: string;
}

export const WEBSITE_BUILDER_FAQS: WebsiteBuilderFaqItem[] = [
  {
    q: 'How much do I need to have ready?',
    a: 'Your business name is enough to begin. Choose your trade and service area, then review everything we generate before publishing.',
  },
  {
    q: 'Can I change the generated content?',
    a: 'Yes. You can edit every service, page, FAQ, service area, color and visual detail before publishing and at any time afterward.',
  },
  {
    q: 'Do I need to own a domain already?',
    a: 'No. Publish immediately on the included letsgetquoted.com subdomain, then connect a domain you own whenever you are ready.',
  },
  {
    q: 'What happens when somebody requests an estimate?',
    a: 'The job description, intake answers, location, photos and estimate range arrive together in your inbox and dashboard—ready for you to quote, schedule or text.',
  },
  {
    q: 'What kind of video can I add?',
    a: 'Upload an MP4 or MOV, or add a YouTube link. Choose from six layouts, including hero backgrounds, project stories and vertical-video reels.',
  },
  {
    q: 'What does it cost?',
    a: `The website builder is included on every base plan. ${PUBLIC_PRICING_SUMMARY} Stripe costs are separate.`,
  },
];
