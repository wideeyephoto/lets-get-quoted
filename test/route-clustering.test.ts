import { describe, it, expect } from 'vitest';
import {
  clusterStopsByCrew,
  estimateRouteDistance,
  type GeoStop,
} from '../src/lib/route-density';

describe('Route Clustering & Multi-Crew Optimization', () => {
  // Sample stops across Detroit metro (Royal Oak, Troy, Birmingham, Sterling Heights, Detroit)
  const stops: GeoStop[] = [
    { id: 's1', lat: 42.4895, lng: -83.1446, label: 'Royal Oak Stop 1' },
    { id: 's2', lat: 42.4920, lng: -83.1480, label: 'Royal Oak Stop 2' },
    { id: 's3', lat: 42.5803, lng: -83.1428, label: 'Troy Stop 1' },
    { id: 's4', lat: 42.5950, lng: -83.1300, label: 'Troy Stop 2' },
  ];

  it('estimates route distance and drive time realistically', () => {
    const singleStopEstimate = estimateRouteDistance([stops[0]]);
    expect(singleStopEstimate.totalMiles).toBe(0);
    expect(singleStopEstimate.totalDriveMinutes).toBe(0);

    const multiStopEstimate = estimateRouteDistance(stops);
    expect(multiStopEstimate.totalMiles).toBeGreaterThan(5);
    expect(multiStopEstimate.totalDriveMinutes).toBeGreaterThan(10);
  });

  it('assigns all stops to single crew when 1 crew provided', () => {
    const clusters = clusterStopsByCrew({
      stops,
      crews: [{ id: 'crew-1', name: 'Truck 1' }],
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0].crewId).toBe('crew-1');
    expect(clusters[0].stops).toHaveLength(4);
    expect(clusters[0].totalMiles).toBeGreaterThan(0);
  });

  it('partitions stops geographically across multiple crews', () => {
    const crews = [
      { id: 'crew-south', name: 'South Crew', startLocation: { lat: 42.4800, lng: -83.1400 } }, // Royal Oak anchor
      { id: 'crew-north', name: 'North Crew', startLocation: { lat: 42.6000, lng: -83.1300 } }, // Troy anchor
    ];

    const clusters = clusterStopsByCrew({ stops, crews });
    expect(clusters).toHaveLength(2);

    const southCluster = clusters.find((c) => c.crewId === 'crew-south')!;
    const northCluster = clusters.find((c) => c.crewId === 'crew-north')!;

    expect(southCluster.stops.map((s) => s.id)).toEqual(expect.arrayContaining(['s1', 's2']));
    expect(northCluster.stops.map((s) => s.id)).toEqual(expect.arrayContaining(['s3', 's4']));
  });

  it('handles empty stops gracefully', () => {
    const clusters = clusterStopsByCrew({
      stops: [],
      crews: [{ id: 'crew-1', name: 'Truck 1' }],
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0].stops).toHaveLength(0);
    expect(clusters[0].totalMiles).toBe(0);
  });
});
