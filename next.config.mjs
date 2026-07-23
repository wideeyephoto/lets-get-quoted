/** @type {import('next').NextConfig} */

// Derive the Supabase Storage hostname from the public env var at config-eval
// time (mirrors src/lib/supabase-url.ts). Falls back to a wildcard so a
// missing/garbled env var never crashes the build and uploads still load once
// the var is set.
function supabaseImageHost() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (raw) {
    const dash = raw.match(/https?:\/\/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
    if (dash) return `${dash[1]}.supabase.co`;
    try {
      return new URL(raw).hostname;
    } catch {
      // fall through to the wildcard
    }
  }
  return '**.supabase.co';
}

const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.pexels.com', pathname: '/**' },
      { protocol: 'https', hostname: supabaseImageHost(), pathname: '/storage/v1/object/public/site-images/**' },
    ],
  },
};

export default nextConfig;
