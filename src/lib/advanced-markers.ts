'use client';

type MarkerOptions = google.maps.marker.AdvancedMarkerElementOptions;

export function createAdvancedMarker(
  library: google.maps.MarkerLibrary,
  options: MarkerOptions,
  child?: Node,
): google.maps.marker.AdvancedMarkerElement {
  const marker = new library.AdvancedMarkerElement(options);
  if (child) marker.replaceChildren(child);
  return marker;
}

export function circleMarkerContent({
  diameter,
  fill,
  border = '#0b1220',
  borderWidth = 2,
  opacity = 1,
  label,
  labelColor = '#0b1220',
}: {
  diameter: number;
  fill: string;
  border?: string;
  borderWidth?: number;
  opacity?: number;
  label?: string;
  labelColor?: string;
}): HTMLDivElement {
  const node = document.createElement('div');
  node.style.width = `${diameter}px`;
  node.style.height = `${diameter}px`;
  node.style.boxSizing = 'border-box';
  node.style.borderRadius = '50%';
  node.style.background = fillWithOpacity(fill, opacity);
  node.style.border = `${borderWidth}px solid ${border}`;
  node.style.display = 'grid';
  node.style.placeItems = 'center';
  node.style.color = labelColor;
  node.style.font = '700 12px/1 system-ui, sans-serif';
  if (label) node.textContent = label;
  return node;
}

function fillWithOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${opacity})`;
}

export function imageMarkerContent(url: string, width: number, height: number): HTMLImageElement {
  const image = document.createElement('img');
  image.src = url;
  image.width = width;
  image.height = height;
  image.alt = '';
  image.style.display = 'block';
  return image;
}
