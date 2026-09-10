import type { GeoPoint } from './types.js';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export async function geocodeNominatim(query: string): Promise<GeoPoint | null> {
  const url = new URL('/search', NOMINATIM_BASE);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'geospatial-company-discovery/0.1 (personal tool)' },
  });

  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (data.length === 0) return null;

  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

export async function batchGeocodeCensus(
  addresses: Array<{ id: string; address: string; city: string; state: string; zip: string }>,
): Promise<Map<string, GeoPoint>> {
  const results = new Map<string, GeoPoint>();

  const csvLines = addresses.map(
    (a) => `${a.id},${a.address},${a.city},${a.state},${a.zip}`,
  );

  for (let i = 0; i < csvLines.length; i += 10000) {
    const chunk = csvLines.slice(i, i + 10000);
    const csvContent = chunk.join('\n');

    const formData = new FormData();
    formData.append(
      'addressFile',
      new Blob([csvContent], { type: 'text/csv' }),
      'addresses.csv',
    );
    formData.append('benchmark', 'Public_AR_Current');

    const res = await fetch(
      'https://geocoding.geo.census.gov/geocoder/locations/addressbatch',
      { method: 'POST', body: formData },
    );

    if (!res.ok) continue;
    const text = await res.text();

    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('","').map((s) => s.replace(/"/g, ''));
      if (parts.length >= 6 && parts[2] === 'Match') {
        const coords = parts[5].split(',');
        if (coords.length === 2) {
          results.set(parts[0], {
            lat: parseFloat(coords[1]),
            lng: parseFloat(coords[0]),
          });
        }
      }
    }
  }

  return results;
}
