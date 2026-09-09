import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import FaqList from '@/components/marketing/faq-list';
import { TRADES } from '@/lib/trades';
import VideoStudioSimulator from './VideoStudioSimulator';

export const metadata: Metadata = {
  title: 'Multimodal Video Studio · AI Video Walkthroughs & Codec-Compliant Reels for Contractors',
  description:
    'Turn site walkthrough videos into itemized scopes, and publish 60fps contractor video reels with zero mobile speed penalty. Verified video codecs and Google rich results.',
  alternates: { canonical: 'https://letsgetquoted.com/features/video-studio' },
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/video-studio',
    siteName: "Let's Get Quoted",
    title: 'Multimodal Video Studio · AI Video Walkthroughs & Codec-Compliant Reels',
    description:
      'Turn job walkthrough videos into itemized scopes, and publish 60fps contractor video reels with zero mobile speed penalty.',
    images: [{ url: '/features/og-ai-vision.jpg', width: 1200, height: 630, alt: 'Multimodal Video Studio for Contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Multimodal Video Studio · AI Video Walkthroughs & Codec-Compliant Reels',
    description:
      'Turn job walkthrough videos into itemized scopes, and publish 60fps contractor video reels with zero mobile speed penalty.',
    images: ['/features/og-ai-vision.jpg'],
  },
};

const FAQ = [
  {
    q: 'How does the Multimodal Video Studio convert job-site walkthroughs into quotes?',
    a: 'When you record a walkthrough video with your phone, Multimodal AI processes the visual frames and contractor narration simultaneously. It identifies demolition scope, electrical and plumbing relocation requirements, and material quantities, and maps them to timestamped line items with labor and materials drafted directly into your quote.',
  },
  {
    q: 'Why does Let’s Get Quoted enforce strict video file size and codec guardrails?',
    a: 'Heavy 4K video uploads from iPhones frequently stall or crash contractor websites on slow cellular connections, killing lead conversion. LGQ enforces a strict ≤12 MB recommendation for auto-playing background hero loops, advises dual-stream H.264/WebM encoding, and provides high-res still poster fallbacks so pages load in under a second.',
  },
  {
    q: 'What video layouts are supported on my contractor website?',
    a: 'You get 6 native video layouts: Full-bleed Hero Loop, Video + Copy Split Section, Project Story Case Study, 9:16 Vertical Reel, Homeowner Video Testimonial Card, and 3-Step Workmanship Process Clip. You can mix and match up to four video bands per page.',
  },
  {
    q: 'Does the Video Studio generate Google Video SEO rich snippets?',
    a: 'Yes. Every project video and client review automatically emits Schema.org VideoObject JSON-LD structured data with key moment timestamps, video descriptions, and thumbnail references, qualifying your videos for Google Search rich video carousels.',
  },
  {
    q: 'Can I upload videos directly from my iPhone or Android in the field?',
    a: 'Yes. Upload standard MOV, MP4, or WebM clips up to 50 MB directly from your mobile browser or text them to your AI Copilot. Our media engine optimizes delivery for iOS Safari and Android Chrome hardware acceleration automatically.',
  },
];

export default function VideoStudioPage() {
  return (
    <FeatureDetailLayout
      breadcrumb={{ name: 'Multimodal Video Studio', path: '/features/video-studio' }}
      eyebrow="⚡ MULTIMODAL VIDEO STUDIO &amp; REEL ENGINE"
      title={
        <>
          Turn job walkthroughs into quotes. <em>Publish 60fps contractor reels without slowing down your site.</em>
        </>
      }
      lede="Send a video walkthrough of a job site for automated scope notes, or upload your footage for your contractor website with verified video codecs, mobile speed guardrails, and Google rich results."
      heroNote="Multimodal AI takeoff engine · 6 native video layouts · Strict ≤12MB mobile hero loop cap · Schema.org VideoObject JSON-LD"
      heroChips={['⚡ Video Walkthrough Takeoffs', '⚡ 60fps Mobile Hardware Acceleration', '⚡ Google Rich Video SEO']}
      primary={{ label: 'Start free on Flex', href: 'https://app.letsgetquoted.com/start?goal=build_site&source=feature_page' }}
      secondary={{ label: 'See all features', href: '/features' }}

      demo={
        <ExampleFrame
          label="Live Multimodal Video Studio & Scope Extraction Simulator"
          note="Interactive video simulation. Scans job-site walkthrough footage, extracts timestamped takeoff actions into draft quotes, and verifies mobile codec compliance."
        >
          <VideoStudioSimulator />
        </ExampleFrame>
      }
      proof={[
        { title: 'Sub-Second LCP', body: 'Strict ≤12MB hero guardrails protect your mobile website speed.' },
        { title: 'Automated Scope', body: 'AI extracts demolition, electrical, and finish tasks with exact timestamps.' },
        { title: 'Trade Precision', body: `Trained on workflows across all ${TRADES.length} contractor trades.` },
        { title: 'Google Rich Snippets', body: 'Emits VideoObject JSON-LD structured data with key moments.' },
      ]}
      story={{
        eyebrow: 'Contractors waste hours typing scopes or break websites with heavy video',
        title: 'Video proves craftsmanship—when done right.',
        body: 'Homeowners want to see real work before they hire a contractor. But uploading raw 200MB 4K clips from an iPhone destroys mobile load speed and drives high-value leads away. Let’s Get Quoted gives you the best of both worlds: AI that extracts line-item quotes from your raw walkthrough videos in seconds, and an automated publishing studio that delivers silky 60fps video reels engineered for instant mobile page loads.',
      }}
      benefits={[
        {
          title: 'Multimodal Walkthrough Takeoffs',
          body: 'Walk through any site with your phone recording. Your AI Copilot detects room alcoves, cabinet runs, and electrical locations, structuring line-item costs before you leave the driveway.',
        },
        {
          title: 'Mobile Speed & Codec Guardrails',
          body: 'Enforces strict payload limits and advises on H.264/WebM dual-streaming and iPhone export settings so your website loads instantly on any customer phone.',
        },
        {
          title: 'Google Rich Result SEO & Structured Data',
          body: 'Automatically generates VideoObject JSON-LD with clip markup and timestamped key moments, positioning your trade business at the top of Google search results.',
        },
      ]}
      stepsEyebrow="From site walkthrough to closed job"
      stepsTitle="Four seamless steps powered by Multimodal AI"
      steps={[
        {
          title: '01 · Record a video walkthrough on site',
          body: 'Walk through the project pointing out demo areas, relocations, and new fixtures while speaking your notes.',
        },
        {
          title: '02 · AI extracts timestamped takeoff actions',
          body: 'Computer vision and audio intelligence identify specific scope tasks and attach them to exact video timestamps.',
        },
        {
          title: '03 · Review the line-item quote draft',
          body: 'Check the auto-calculated materials and labor, tweak profit margins, and text the approved quote to the client.',
        },
        {
          title: '04 · Publish high-speed reel to your website',
          body: 'One click publishes the verified clip into your website hero or project story gallery with full SEO schema.',
        },
      ]}
      cta={{
        title: 'Launch your contractor website with Multimodal Video Studio.',
        note: 'Included on all Let’s Get Quoted plans. Zero monthly website fees on Flex.',
      }}
    >
      <FaqList
        items={FAQ}
        eyebrow="Before you upload"
        title="Frequently asked questions about the Multimodal Video Studio."
        id="video-studio-faq"
      />
    </FeatureDetailLayout>
  );
}
