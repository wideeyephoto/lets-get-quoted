'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-fetch the (server-rendered) tracking page on an interval so status/ETA stay
// current without the customer manually reloading.
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
