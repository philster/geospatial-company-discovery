import type { QueryResponse } from './types';

export async function searchCompanies(params: {
  lat?: number;
  lng?: number;
  location?: string;
  radius_miles: number;
}): Promise<QueryResponse> {
  const url = new URL('/api/query', window.location.origin);

  if (params.lat !== undefined && params.lng !== undefined) {
    url.searchParams.set('lat', String(params.lat));
    url.searchParams.set('lng', String(params.lng));
  } else if (params.location) {
    url.searchParams.set('location', params.location);
  }
  url.searchParams.set('radius_miles', String(params.radius_miles));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}
