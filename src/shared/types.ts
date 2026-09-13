export interface StagingGoogleMaps {
  id: number;
  place_id: string;
  name: string;
  address: string | null;
  category: string | null;
  website: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  raw_json: string;
  crawl_run: string;
  crawled_at: string;
}

export interface StagingDataSF {
  id: number;
  datasf_id: string;
  business_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  naics_code: string | null;
  naics_desc: string | null;
  start_date: string | null;
  raw_json: string;
  crawl_run: string;
  crawled_at: string;
}

export interface StagingUsearch {
  id: number;
  usearch_id: string | null;
  company_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  industry: string | null;
  revenue: string | null;
  employee_count: string | null;
  raw_json: string;
  crawl_run: string;
  crawled_at: string;
}

export interface StagingEnrichment {
  id: number;
  source_table: string;
  source_row_id: number;
  attribute_type: string;
  attribute_value: string;
  source: string;
  source_url: string | null;
  evidence: string | null;
  crawled_at: string;
}

export interface Company {
  id: number;
  canonical_name: string;
  aliases: string | null;
  category: string | null;
  website: string | null;
  source: string;
  source_id: string | null;
  crawled_at: string;
}

export interface Address {
  id: number;
  address1: string;
  address2: string | null;
  aliases: string | null;
  city: string;
  state: string | null;
  zip: string | null;
  country: string;
  lat: number;
  lng: number;
  source: string;
  source_id: string | null;
  crawled_at: string;
}

export interface CompanyAddress {
  company_id: number;
  address_id: number;
  is_headquarters: boolean;
  phone: string | null;
  source: string;
  confidence: number;
  crawled_at: string;
}

export interface CompanyAttribute {
  id: number;
  company_id: number;
  attribute_type: string;
  attribute_value: string;
  source: string;
  source_url: string | null;
  confidence: number;
  evidence: string | null;
  crawled_at: string;
}

export interface QueryResult {
  company: Company;
  address: Address;
  distance_miles: number;
  is_headquarters: boolean;
  phone: string | null;
  confidence: number;
  attributes: CompanyAttribute[];
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ApifyPlace {
  rank?: number;
  title?: string;
  name?: string;
  address?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  categoryName?: string | null;
  category?: string | null;
  website?: string | null;
  phone?: string | null;
  phoneUnformatted?: string | null;
  location?: { lat: number; lng: number };
  lat?: number;
  lng?: number;
  placeId?: string;
  cid?: string;
  totalScore?: number;
  reviewsCount?: number;
  [key: string]: unknown;
}
