import type { GeoPoint, QueryResult } from './types.js';

export interface CompanyDiscoverySource {
  name: string;
  crawl(options: CrawlOptions): Promise<number>;
}

export interface CrawlOptions {
  location?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  maxPages?: number;
  [key: string]: unknown;
}

export interface CrossReferenceSource {
  name: string;
  validate(companyName: string, address: string): Promise<{
    matched: boolean;
    confidence: number;
    source_id?: string;
  }>;
}

export interface EnrichmentSource {
  name: string;
  enrich(companyName: string, website?: string): Promise<{
    attributes: Array<{
      type: string;
      value: string;
      confidence: number;
      evidence?: string;
      source_url?: string;
    }>;
  }>;
}

export interface GeocoderService {
  geocode(query: string): Promise<GeoPoint | null>;
  batchGeocode?(addresses: Array<{ id: string; address: string; city: string; state: string; zip: string }>): Promise<Map<string, GeoPoint>>;
}

export interface QueryService {
  search(center: GeoPoint, radiusMiles: number): QueryResult[];
}
