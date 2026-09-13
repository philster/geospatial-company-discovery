import type Database from 'better-sqlite3';

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staging_google_maps (
      id            INTEGER PRIMARY KEY,
      place_id      TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      address       TEXT,
      category      TEXT,
      website       TEXT,
      phone         TEXT,
      lat           REAL,
      lng           REAL,
      raw_json      TEXT,
      crawl_run     TEXT NOT NULL,
      crawled_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staging_datasf (
      id            INTEGER PRIMARY KEY,
      datasf_id     TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL,
      address       TEXT,
      city          TEXT,
      state         TEXT,
      zip           TEXT,
      naics_code    TEXT,
      naics_desc    TEXT,
      start_date    TEXT,
      raw_json      TEXT,
      crawl_run     TEXT NOT NULL,
      crawled_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staging_usearch (
      id            INTEGER PRIMARY KEY,
      usearch_id    TEXT,
      dataset       TEXT NOT NULL,
      company_name  TEXT NOT NULL,
      address       TEXT,
      city          TEXT,
      state         TEXT,
      zip           TEXT,
      country       TEXT,
      website       TEXT,
      industry      TEXT,
      sub_industry  TEXT,
      revenue       TEXT,
      employee_count TEXT,
      phone_number  TEXT,
      naics_code    TEXT,
      sic_code      TEXT,
      linkedin_url  TEXT,
      zoominfo_url  TEXT,
      source_url    TEXT,
      published_at  TEXT,
      raw_json      TEXT,
      crawl_run     TEXT NOT NULL,
      crawled_at    TEXT NOT NULL,
      UNIQUE(dataset, usearch_id)
    );

    CREATE TABLE IF NOT EXISTS staging_enrichment (
      id            INTEGER PRIMARY KEY,
      source_table  TEXT NOT NULL,
      source_row_id INTEGER NOT NULL,
      attribute_type TEXT NOT NULL,
      attribute_value TEXT NOT NULL,
      source        TEXT NOT NULL,
      source_url    TEXT,
      evidence      TEXT,
      crawled_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id            INTEGER PRIMARY KEY,
      address1      TEXT NOT NULL,
      address2      TEXT,
      aliases       TEXT,
      city          TEXT NOT NULL,
      state         TEXT,
      zip           TEXT,
      country       TEXT NOT NULL DEFAULT 'US',
      lat           REAL NOT NULL,
      lng           REAL NOT NULL,
      source        TEXT NOT NULL,
      source_id     TEXT,
      crawled_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS companies (
      id            INTEGER PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      aliases       TEXT,
      category      TEXT,
      website       TEXT,
      source        TEXT NOT NULL,
      source_id     TEXT,
      crawled_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_addresses (
      company_id    INTEGER NOT NULL REFERENCES companies(id),
      address_id    INTEGER NOT NULL REFERENCES addresses(id),
      is_headquarters INTEGER DEFAULT 0,
      phone         TEXT,
      source        TEXT NOT NULL,
      confidence    REAL NOT NULL,
      crawled_at    TEXT NOT NULL,
      PRIMARY KEY (company_id, address_id)
    );

    CREATE TABLE IF NOT EXISTS company_attributes (
      id            INTEGER PRIMARY KEY,
      company_id    INTEGER NOT NULL REFERENCES companies(id),
      attribute_type TEXT NOT NULL,
      attribute_value TEXT NOT NULL,
      source        TEXT NOT NULL,
      source_url    TEXT,
      confidence    REAL NOT NULL,
      evidence      TEXT,
      crawled_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_addresses_coords ON addresses(lat, lng);
    CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(canonical_name);
    CREATE INDEX IF NOT EXISTS idx_company_attributes_company ON company_attributes(company_id);
    CREATE TABLE IF NOT EXISTS usearch_raw_crawl (
      id            INTEGER PRIMARY KEY,
      dataset       TEXT NOT NULL,
      row_hash      TEXT,
      raw_json      TEXT NOT NULL,
      crawl_run     TEXT NOT NULL,
      crawled_at    TEXT NOT NULL,
      UNIQUE(dataset, row_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_staging_gm_name ON staging_google_maps(name);
    CREATE INDEX IF NOT EXISTS idx_staging_datasf_name ON staging_datasf(business_name);
    CREATE INDEX IF NOT EXISTS idx_staging_usearch_name ON staging_usearch(company_name);
    CREATE INDEX IF NOT EXISTS idx_usearch_raw_dataset ON usearch_raw_crawl(dataset);
  `);
}
