export interface PlatformBlogAuthor {
  name: string;
  role: string;
  avatarUrl?: string;
  bio?: string;
}

// Shared data must not import either article collection: both need the author
// while their modules initialize, including during sitemap generation.
export const DEFAULT_AUTHOR: PlatformBlogAuthor = {
  name: 'Brett',
  role: "Founder, Let's Get Quoted",
  avatarUrl: '/apple-icon.png',
  bio: 'Building modern business tools for independent trade contractors without monthly subscription bloat.',
};
