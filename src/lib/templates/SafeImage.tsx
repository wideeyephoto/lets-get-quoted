import Image from 'next/image';

// next/image throws during server render — 500-ing the whole public page — if
// src is on a host not in next.config's images.remotePatterns. Contractor image
// fields are select-only (Unsplash stock or this project's Supabase uploads)
// today, but a stray or legacy URL must degrade to a broken <img>, never take
// the page down. So optimize known-good hosts and pass anything else through
// as a plain <img> (which the surrounding descendant CSS styles identically).
export function isOptimizableHost(src: string): boolean {
  try {
    const { hostname } = new URL(src);
    return hostname === 'images.unsplash.com' || hostname === 'images.pexels.com' || hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

type SafeImageProps = {
  className?: string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "auto" | "sync";
  draggable?: boolean;
  'data-edit'?: string;
  'data-parallax'?: string;
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  sizes?: string;
};

export default function SafeImage({ src, alt, width, height, sizes, className, loading, decoding, draggable, ...rest }: SafeImageProps) {
  if (isOptimizableHost(src) && width && height) {
    return <Image className={className} src={src} alt={alt} width={width} height={height} sizes={sizes} loading={loading} decoding={decoding} draggable={draggable} {...rest} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt={alt} width={width || undefined} height={height || undefined} loading={loading || "lazy"} decoding={decoding || "async"} draggable={draggable} {...rest} />;
}
