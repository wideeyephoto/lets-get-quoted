import Image from 'next/image';

// next/image throws during server render — 500-ing the whole public page — if
// src is on a host not in next.config's images.remotePatterns. Contractor image
// fields are select-only (Unsplash stock or this project's Supabase uploads)
// today, but a stray or legacy URL must degrade to a broken <img>, never take
// the page down. So optimize known-good hosts and pass anything else through
// as a plain <img> (which the surrounding descendant CSS styles identically).
function isOptimizableHost(src: string): boolean {
  try {
    const { hostname } = new URL(src);
    return hostname === 'images.unsplash.com' || hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

type SafeImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
};

export default function SafeImage({ src, alt, width, height, sizes }: SafeImageProps) {
  if (isOptimizableHost(src)) {
    return <Image src={src} alt={alt} width={width} height={height} sizes={sizes} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" />;
}
