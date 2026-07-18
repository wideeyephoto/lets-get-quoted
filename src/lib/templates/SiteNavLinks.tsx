import type { Site } from '@/lib/sites';
import { getPublishedFaqs, getPublishedShowcase, getPublishedTestimonials } from '@/lib/site-content';

type SiteNavLink = {
  href: string;
  label: string;
};

type SiteNavLinksProps = {
  site: Site;
  links: SiteNavLink[];
  className: string;
};

export default function SiteNavLinks({ site, links, className }: SiteNavLinksProps) {
  const dynamicLinks: SiteNavLink[] = [];

  if (getPublishedShowcase(site.content)) dynamicLinks.push({ href: '#showcase', label: 'Showcase' });
  if (getPublishedTestimonials(site.content)) dynamicLinks.push({ href: '#reviews', label: 'Reviews' });
  if (getPublishedFaqs(site.content)) dynamicLinks.push({ href: '#faqs', label: 'FAQs' });

  return (
    <nav className={className} aria-label="Main navigation">
      {[...links, ...dynamicLinks].map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
    </nav>
  );
}
