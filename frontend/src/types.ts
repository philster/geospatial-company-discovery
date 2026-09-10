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

export interface Company {
  id: number;
  canonical_name: string;
  aliases: string | null;
  category: string | null;
  website: string | null;
  phone: string | null;
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

export interface QueryResult {
  company: Company;
  address: Address;
  distance_miles: number;
  is_headquarters: boolean;
  confidence: number;
  attributes: CompanyAttribute[];
}

export interface QueryResponse {
  center: { lat: number; lng: number };
  radius_miles: number;
  count: number;
  companies: QueryResult[];
}
