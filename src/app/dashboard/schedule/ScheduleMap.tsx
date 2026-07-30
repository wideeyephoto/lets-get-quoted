'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import PinMap, { type MapPin } from '@/components/pin-map';
import ViewGear from '@/components/view-gear';
import type { MapTheme, MapView } from '@/lib/dashboard-views';
import { setMapThemeAction, setMapViewAction } from '../view-actions';

// The schedule map, with the same gear menu the leads and jobs pages carry, so
// "turn the map off" and "switch it to light" live in one place across the
// dashboard rather than being a different control on every page.
//
// The calendar is the point of this page, so the map sits BELOW it. That also
// means the gear has to survive the map being switched off — otherwise there'd
// be no way to switch it back on.
export default function ScheduleMap({
  pins,
  mapView,
  mapTheme,
}: {
  pins: MapPin[];
  mapView: MapView;
  mapTheme: MapTheme;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setMap(next: MapView) {
    startTransition(async () => {
      await setMapViewAction(next, 'schedule');
      router.refresh();
    });
  }
  function setTheme(next: MapTheme) {
    startTransition(async () => {
      await setMapThemeAction(next);
      router.refresh();
    });
  }

  const gear = (
    <ViewGear
      mapView={mapView}
      onSetMapView={setMap}
      mapTheme={mapTheme}
      onSetMapTheme={setTheme}
      label="Change view"
    />
  );

  if (mapView === 'off') {
    return <div className="schedule-map-off">{gear}</div>;
  }

  return (
    <div className="workspace-embedded-map schedule-map" data-pending={pending || undefined}>
      <PinMap pins={pins} theme={mapTheme} legendAccessory={gear} />
    </div>
  );
}
