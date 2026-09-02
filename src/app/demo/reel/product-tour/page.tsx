import type { Metadata } from 'next';
import FlagshipProductTourReel from '@/components/demo/FlagshipProductTourReel';

export const metadata: Metadata = {
  title: "Flagship Product Tour Reel | Let's Get Quoted",
  description: "A 16:9 widescreen product tour reel showing the full customer and contractor journey.",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams?: Promise<{
    autoplay?: string | string[];
    scene?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FlagshipProductTourPage({ searchParams: searchParamsPromise }: PageProps) {
  const searchParams = (await searchParamsPromise) || {};
  const requestedScene = Number.parseInt(firstValue(searchParams?.scene) ?? '0', 10);
  const initialScene = Number.isFinite(requestedScene) ? Math.min(Math.max(requestedScene, 0), 9) : 0;
  const autoplay = firstValue(searchParams?.autoplay) !== '0';

  return <FlagshipProductTourReel initialScene={initialScene} autoplay={autoplay} />;
}
