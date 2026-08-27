import type { Metadata } from 'next';
import BathToShowerReel from '@/components/demo/BathToShowerReel';

export const metadata: Metadata = {
  title: 'Bath-to-shower quote reel | Let\'s Get Quoted',
  description: 'A contractor turns a bathroom-remodel lead into a booked job.',
  robots: { index: false, follow: false },
};

type ReelPageProps = {
  searchParams?: {
    autoplay?: string | string[];
    scene?: string | string[];
  };
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function BathToShowerReelPage({ searchParams }: ReelPageProps) {
  const requestedScene = Number.parseInt(firstValue(searchParams?.scene) ?? '0', 10);
  const initialScene = Number.isFinite(requestedScene)
    ? Math.min(Math.max(requestedScene, 0), 4)
    : 0;
  const autoplay = firstValue(searchParams?.autoplay) !== '0';

  return <BathToShowerReel initialScene={initialScene} autoplay={autoplay} />;
}
