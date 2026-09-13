# Geospatial Company Discovery

A personal, single-user, local-first tool that discovers companies near a
specific map location by combining Google Maps data, business registries,
and lightweight web enrichment.

Sample query:

> "Find software engineering companies within 5 miles of downtown San
> Francisco"

## Purpose & context

- Personal tool — single user, no accounts, no auth. Runs locally.
- Minimal budget for data providers — Apify free tier ($5/month,
  ~1,000 Google Maps places/month). All other sources must be free or
  public-record.
- Geographic scope for v1: **San Francisco first**. DataSF is used as a
  cross-reference but the primary source (Google Maps via Apify) works
  anywhere, so expanding to other cities should not require a full rewrite.

## Data relationship

Discovery is **company-first** — companies are discovered directly from
Google Maps and other sources, then grouped by street address in the UI
to show what's at each location.

Data flows through three layers:

```text
                        ┌─────────────────────────────┐
                        │       1. RAW ARCHIVE         │
                        │   JSON files in data/raw/    │
                        │   + usearch_raw_crawl table  │
                        │   Full responses, all fields │
                        │   preserved verbatim         │
                        └──────────────┬──────────────┘
                                       ↓
                        ┌─────────────────────────────┐
                        │     2. STAGING TABLES        │
                        │   (SQLite, per-source)       │
                        │   staging_google_maps        │
                        │   staging_datasf             │
                        │   staging_usearch            │
                        │   Extracted fields for       │
                        │   cross-ref and dedup        │
                        └──────────────┬──────────────┘
                                       ↓
                           npm run process
                        (match, dedup, validate)
                                       ↓
                        ┌─────────────────────────────┐
                        │    3. PRODUCTION TABLES      │
                        │   (SQLite, normalized)       │
                        │   companies, addresses,      │
                        │   company_addresses,         │
                        │   company_attributes         │
                        │   ← queried by API/CLI/UI    │
                        └─────────────────────────────┘
```

**Layer 1 — Raw archive:** full API/crawl responses preserved verbatim.
For Google Maps and DataSF, stored as JSON files in
`data/raw/{source}/{timestamp}.json`. For Usearch, stored in the
`usearch_raw_crawl` SQLite table (keyed by dataset + row hash).
Preserves every field from every source, even fields not currently used.
Can re-process from raw at any time without re-crawling.

**Layer 2 — Staging tables:** per-source SQLite tables that extract the
fields needed for cross-referencing and dedup. Schema is source-specific
and doesn't need to match production tables. One table per source.

**Layer 3 — Production tables:** clean, normalized `companies`,
`addresses`, `company_addresses`, `company_attributes`. Only populated
by the `process` pipeline. This is what the query API, CLI query scripts,
and frontend read.

## Architecture

Data flows through three phases — crawl, process, query — each
independently runnable:

1. **CLI crawl scripts** fetch data from external sources, save raw JSON
   archives to `data/raw/`, and populate per-source staging tables in
   SQLite.
2. **CLI process script** reads staging tables, runs cross-referencing /
   dedup / validation, and writes clean results to production tables.
   Can re-run without re-crawling.
3. **Backend server** is a thin read-only query layer over production
   tables. It receives a location + radius, performs a SpatiaLite spatial
   query, and returns companies synchronously.
4. **Frontend** sends the user's pin location (or geocoded address) + radius
   to the server and renders results instantly from production data.
5. **CLI query scripts** for quick testing without spinning up the frontend.
   Query production tables via SpatiaLite directly — no running server
   required.

### CLI crawl commands

Crawl commands fetch from external sources → write raw JSON to
`data/raw/{source}/{timestamp}.json` → populate staging tables.

- `npm run crawl:companies -- --location "San Francisco, CA" --radius 5`
  — runs Apify Google Maps Extractor for the area. Accepts
  `--location <name>` (geocoded via Nominatim) or `--lat <lat> --lng <lng>`
  plus `--radius <miles>`. Budget-aware: logs credit usage and warns when
  approaching the monthly free-tier limit (~1,000 places).
- `npm run crawl:datasf` — downloads DataSF "Registered Business
  Locations" dataset into `staging_datasf`.
- `npm run crawl:usearch` — crawls Usearch company datasets (130+
  industry/vertical datasets, not just software) into
  `usearch_raw_crawl` (raw) and then `staging_usearch` (normalized).
  Two-phase operation:
  - `npm run crawl:usearch -- --dataset <slug>` fetches a specific
    dataset (e.g. `software-companies`, `ai-startups`,
    `fintech-startups`) into the `usearch_raw_crawl` table. Accepts
    `--max-pages` to limit pages fetched.
  - `npm run crawl:usearch -- --stage` normalizes all raw data into
    `staging_usearch`. Can also pass `--dataset <slug>` to stage only
    one dataset.
- `npm run crawl:enrichment` — reads companies from staging tables
  (google_maps, usearch, datasf), scrapes additional data from company
  websites / SEC EDGAR, writes to `staging_enrichment`.

All crawl commands are idempotent — re-running upserts staging rows
via source-specific unique IDs (place_id, datasf_id, usearch_id) and
appends new raw archives. Does not duplicate or wipe previous data.

### CLI process command

Reads staging tables, runs matching/dedup/validation, writes to
production tables:

```bash
npm run process
npm run process -- --source google_maps   # process only one source
```

Steps:
1. Collect all records from staging tables (Google Maps, DataSF, Usearch)
2. Parse addresses using `vladdress` — splits full address strings into
   structured components (address1, address2, city, state, zip). Addresses
   that fail to parse are kept as raw strings with a summary logged
3. Extract per-record data dates: `published_at` for Usearch,
   `scrapedAt` from Google Maps `raw_json` (via `json_extract`),
   `start_date` for DataSF
4. Geocode records missing coordinates via Census batch geocoder, with
   Nominatim fallback for up to 50 remaining unresolved addresses
5. Deduplicate companies across sources by name similarity, website match,
   and address similarity
6. Cross-reference Google Maps results against DataSF (for SF locations) —
   companies confirmed by both sources get a confidence boost
7. Write merged results to production `companies`, `addresses`,
   `company_addresses`. Address rows are shared across companies at the
   same building (street-level dedup); suite/unit info goes into
   `company_addresses.address2`
8. Apply enrichment data from `staging_enrichment` to `company_attributes`
9. Attach Usearch revenue/employee_count directly from `staging_usearch`
   to `company_attributes`

Can re-run at any time without re-crawling — reads from staging tables
and raw archives.

### CLI query scripts

For quick testing and data inspection without the frontend:

```bash
npm run query -- --location "San Francisco, CA" --radius 5
npm run query -- --lat 37.77 --lng -122.42 --radius 3
npm run query -- --lat 37.77 --lng -122.42 --radius 5 --format csv
```

Accepts: `--location <address>` or `--lat/--lng`, `--radius <miles>`
(default: 5), `--format json|csv` (default: json). Queries production
tables using the `haversine_distance` UDF and outputs matched
companies with address and enrichment data.

### Query API

```text
GET /api/query?lat=37.77&lng=-122.42&radius_miles=5
  → { companies, enrichment }
```

Also accepts `?location=<name>&radius_miles=5` (geocoded server-side).

```text
GET /api/stats
  → { companies, addresses, attributes }
```

Returns row counts for production tables.

## Scope for this build

One-shot implementation covering:

- **Crawl pipeline** — fetch companies from Apify Google Maps, DataSF,
  and Usearch into raw JSON archives + staging tables.
- **Process pipeline** — cross-reference, deduplicate, validate, and
  merge staging data into clean production tables.
- **Query layer** — backend API + frontend rendering companies on an
  interactive map grouped by street address, plus CLI query scripts.
- **Company enrichment** — best-effort *snapshot* of employee count /
  revenue where a conservative source has it (Google Maps metadata, SEC
  EDGAR, company website).

### Out of scope for v1

- Careers-site discovery, open-roles listings, job board integration.
- Multi-city support (requires finding equivalent business registries per
  city).
- Scheduled/automatic re-crawling — data refreshes on manual re-run only.

## Data sources

| Need | Source | Notes |
|---|---|---|
| Company discovery (primary) | **Apify Google Maps Extractor** (`compass/google-maps-extractor`, actor ID `nwua9Gu5YrADL7ZDj`) | Returns company name, address, coordinates, category, website, phone. Free tier: ~1,000 places/month ($5 credit). Use via Apify JS SDK (`apify-client`). See [data quality notes](#google-maps-data-quality) below. |
| Cross-reference / validation (SF) | **DataSF "Registered Business Locations" open dataset** | Free, authoritative, regularly updated — company name + exact address + industry code. Important for validating Google Maps results and catching real businesses that Google Maps misses. SF-specific. |
| Company discovery (multi-industry) | **Usearch.com** unauthenticated JSON API (130+ datasets by industry/vertical) | Datasets cover AI, fintech, biotech, SaaS, manufacturing, retail, and many more verticals — not just software. Each dataset provides HQ address, industry, sub-industry, revenue, employees, website, phone, NAICS/SIC codes, LinkedIn URL. Coverage comparison with Google Maps is pending (see deferred decision). |
| Geocoding (free-text location input) | Nominatim (OSM) | Rate-limited (~1 req/sec) per its usage policy; used for user-entered search locations and CLI --location args, not bulk lookups. |
| Geocoding (bulk address resolution) | **US Census Bureau batch geocoder** | Free, no auth, up to 10k addresses per request. Used to geocode Usearch company HQ addresses. |
| Company enrichment | Google Maps metadata (already captured during crawl) + conservative scraping: company's own website, SEC EDGAR (public companies only) | Google Maps provides website and phone out of the box — reduces the need for separate scraping. LinkedIn and other scraper-hostile sites are explicitly **excluded** — see coverage-gap tradeoff below. |

### Google Maps data quality

A test crawl of 50 "software companies" in SF Financial District revealed:

- **Good coverage for listed businesses:** 94% have websites, 80% have
  phones. Multi-tenant buildings work (e.g., 500 Terry A Francois Blvd
  returned AppDynamics, Cisco, Splunk, ThousandEyes).
- **~30-40% noise from SEO/virtual-address businesses.** Offshore dev
  shops with virtual SF addresses appear as real local companies. The
  `process` step should flag or filter these (e.g., by cross-referencing
  against DataSF, checking for duplicate addresses shared by many
  unrelated businesses, or detecting SEO-stuffed names).
- **Major companies missing.** Salesforce, Stripe, Airbnb, Dropbox, etc.
  are not returned for "software companies" — Google Maps categorizes
  them differently (e.g., "Computer software company" vs. "Software
  company"). Multiple search terms or broader category searches may be
  needed.
- **Category coverage is narrow.** Google Maps category filtering only
  catches self-categorized tech companies, not non-tech companies that
  hire tech workers (banks, healthcare, retail with engineering teams).
  DataSF cross-referencing partially addresses this gap.

### Enrichment coverage gap

Employee count and revenue for private companies are, in practice, mostly
available via LinkedIn — which is intentionally excluded here because
scraping it violates its ToS and it actively blocks scrapers. Without it:

- Most small/private companies will show `employee_count: unknown`
  and `revenue: unknown`.
- SEC EDGAR only covers public companies.
- This is an accepted tradeoff, not a bug: legal/ToS conservatism was
  prioritized over data completeness. If coverage turns out to be too thin
  to be useful in practice, revisit the LinkedIn exclusion as a deliberate,
  scoped decision (e.g., very low request rate, read-only, no login) rather
  than expanding scraping broadly.

## Provenance model

No external source is treated as ground truth. Every derived fact keeps
`source`, `source_id`/`source_url`, `crawled_at` timestamp (using
source-specific data dates where available — `published_at` for Usearch,
`scrapedAt` for Google Maps, `start_date` for DataSF), and `confidence`
score. Company attributes (revenue, employee count) allow
multiple observations from different sources/times to coexist rather
than overwriting — this is what makes revenue-growth tracking possible
later without a schema change. See [Database schema](#database-schema)
for the concrete column definitions.

## Database schema

### Staging tables (layer 2)

Per-source tables populated by crawl commands. Schema mirrors what each
source provides. Upserted on each crawl run via source-specific unique
IDs — previous data is preserved, not wiped.

```sql
-- Google Maps results from Apify
CREATE TABLE staging_google_maps (
  id            INTEGER PRIMARY KEY,
  place_id      TEXT NOT NULL UNIQUE,  -- Google Place ID, used for dedup
  name          TEXT NOT NULL,
  address       TEXT,                  -- full formatted address from Google
  category      TEXT,                  -- primary Google Maps category
  website       TEXT,
  phone         TEXT,
  lat           REAL,
  lng           REAL,
  raw_json      TEXT,                  -- full Apify result row as JSON
  crawl_run     TEXT NOT NULL,         -- timestamp of the crawl run
  crawled_at    TEXT NOT NULL           -- ISO 8601
);

-- DataSF Registered Business Locations
CREATE TABLE staging_datasf (
  id            INTEGER PRIMARY KEY,
  datasf_id     TEXT NOT NULL UNIQUE,  -- DataSF record ID
  business_name TEXT NOT NULL,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  naics_code    TEXT,                  -- industry classification
  naics_desc    TEXT,
  start_date    TEXT,                  -- business start date
  raw_json      TEXT,                  -- full DataSF record as JSON
  crawl_run     TEXT NOT NULL,
  crawled_at    TEXT NOT NULL
);

-- Usearch company datasets (130+ industry verticals)
CREATE TABLE staging_usearch (
  id            INTEGER PRIMARY KEY,
  usearch_id    TEXT,
  dataset       TEXT NOT NULL,         -- friendlyUrl slug, e.g. "software-companies"
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
  published_at  TEXT,
  raw_json      TEXT,                  -- full Usearch record as JSON
  crawl_run     TEXT NOT NULL,
  crawled_at    TEXT NOT NULL,
  UNIQUE(dataset, usearch_id)          -- same company can appear in multiple datasets
);

-- Raw Usearch crawl archive (populated before staging normalization)
CREATE TABLE usearch_raw_crawl (
  id            INTEGER PRIMARY KEY,
  dataset       TEXT NOT NULL,
  row_hash      TEXT,
  raw_json      TEXT NOT NULL,
  crawl_run     TEXT NOT NULL,
  crawled_at    TEXT NOT NULL,
  UNIQUE(dataset, row_hash)
);

-- Enrichment results from website scraping / SEC EDGAR
CREATE TABLE staging_enrichment (
  id            INTEGER PRIMARY KEY,
  source_table  TEXT NOT NULL,         -- "staging_google_maps", "staging_usearch", etc.
  source_row_id INTEGER NOT NULL,      -- id in the source staging table
  attribute_type TEXT NOT NULL,
  attribute_value TEXT NOT NULL,
  source        TEXT NOT NULL,         -- "company_website", "sec_edgar"
  source_url    TEXT,
  evidence      TEXT,
  crawled_at    TEXT NOT NULL
);
```

### Production tables (layer 3)

Normalized, deduplicated data populated by `npm run process`. These are
the only tables read by the query API, CLI query scripts, and frontend.

```sql
-- One row per building/geolocation. Suite/unit info lives in company_addresses.
CREATE TABLE addresses (
  id            INTEGER PRIMARY KEY,
  address1      TEXT NOT NULL,       -- street address, e.g. "415 Mission St"
  city          TEXT NOT NULL,
  state         TEXT,
  zip           TEXT,
  country       TEXT NOT NULL DEFAULT 'US',  -- ISO 3166 Alpha-2
  lat           REAL,                -- nullable; not all addresses geocode successfully
  lng           REAL,
  source        TEXT NOT NULL,       -- "google_maps", "nominatim", "census"
  source_id     TEXT,                -- external ID (e.g. Google Place ID)
  crawled_at    TEXT NOT NULL        -- ISO 8601
);

CREATE TABLE companies (
  id            INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  aliases       TEXT,                -- JSON array of alternate names
  category      TEXT,                -- primary category or industry
  website       TEXT,
  source        TEXT NOT NULL,       -- "google_maps", "usearch", "datasf"
  source_id     TEXT,
  crawled_at    TEXT NOT NULL        -- ISO 8601
);

-- Many-to-many: company can have multiple offices, address can have
-- multiple companies. address2 (suite/unit/floor) is per-company, not
-- per-building, so it lives here rather than in addresses.
CREATE TABLE company_addresses (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  address_id    INTEGER NOT NULL REFERENCES addresses(id),
  address2      TEXT,                -- suite, unit, floor — company-specific
  is_headquarters INTEGER DEFAULT 0,
  phone         TEXT,
  source        TEXT NOT NULL,
  confidence    REAL NOT NULL,       -- 0.0–1.0
  crawled_at    TEXT NOT NULL        -- ISO 8601
);

-- Time-varying, multi-source attributes with provenance.
-- Multiple observations coexist rather than overwrite.
CREATE TABLE company_attributes (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id),
  attribute_type TEXT NOT NULL,      -- "employee_count", "revenue", "industry"
  attribute_value TEXT NOT NULL,
  source        TEXT NOT NULL,
  source_url    TEXT,
  confidence    REAL NOT NULL,       -- 0.0–1.0
  evidence      TEXT,                -- raw snippet/quote the value was derived from
  crawled_at    TEXT NOT NULL        -- ISO 8601
);
```

## Handling missing / uncertain data

- **Addresses with companies from only one source** are still shown on the
  map — coverage gaps should be visible, not silently swallowed. A company
  found on Google Maps but missing from DataSF (or vice versa) is flagged,
  not hidden.
- **Every data point in the UI shows its source and confidence** (e.g.
  "Google Maps, crawled 2026-09-10" vs. "DataSF registry, matched
  2026-09-10") rather than presenting a single unqualified answer.
- Unknown employee count / revenue is displayed as "unknown" per company,
  not hidden or defaulted to zero.

## Technical implementation

### Stack

- **Frontend:** React v19 + TypeScript + Leaflet + Vite (chosen over heavier
  WebGL-based map libraries — simpler setup, sufficient for single-user
  scale).
- **Backend:** Node.js + Express 5 + TypeScript.
- **Database:** SQLite (via `better-sqlite3`) — a single-file, zero-server
  database, matching the "minimal, local" infra decision below (no Postgres
  server to run for a single-user tool). Spatial queries use a custom
  `haversine_distance` UDF registered at connection time rather than the
  SpatiaLite extension.
- **Data ingestion:** CLI scripts (`npm run crawl:*`) fetch from external
  sources into raw JSON archives + staging tables. `npm run process`
  transforms staging data into production tables. Each step runs
  independently.
- **Deployment:** Local only. No hosting/cloud deployment — this is a
  single-user local tool, not a product with a live URL.
- **Auth:** None. Single user, no accounts.

### Query model

```text
GET /api/query?lat=...&lng=...&radius_miles=...
        ↓
haversine_distance UDF query on pre-crawled data
        ↓
{ companies, enrichment }
```

The server reads only from production tables. No background pipeline,
no polling — data must be crawled and processed first via CLI.

### Geographic search

- User can specify the search location either by **typing a free-text place
  name/address** (geocoded via Nominatim) **or by clicking a point on the
  map** — both supported.
- Radius search uses a `haversine_distance(lat1, lng1, lat2, lng2)` UDF
  registered in `better-sqlite3` at connection time. This runs in-process
  (no SpatiaLite extension needed).

### Provider abstraction

Even though v1 hard-codes Apify Google Maps + DataSF + conservative
scraping, keep clean interfaces for company discovery, cross-referencing,
and enrichment so sources can be swapped or added later (e.g., if this
ever expands beyond SF and DataSF-equivalent data doesn't exist for
another city) without touching calling code.

## Dashboard UX

Three-pane layout, plus a list view:

- **Left:** search box (address/place name) + radius input.
- **Center:** Leaflet map — search center, radius boundary, company
  markers (clustered by street address), selected company highlighted.
- **Right:** detail panel for the selected company — source/confidence,
  website, industry, phone, employee count/revenue (or "unknown").
- **Additional: sortable/filterable table view** of all discovered
  companies (company, category, employee count, address, distance),
  alongside the map — chosen over a map-only view because scanning 100+
  pin-by-pin results is impractical. Not required to support CSV export
  in v1, but the table should be structured so that's a small addition
  later.

## Data refresh

Manual re-run of CLI crawl commands + `npm run process` only. No
scheduler, no automatic re-crawl. If data goes stale, the user re-runs
the appropriate crawl command and then `process`. Previous raw archives
are preserved (not overwritten) so historical snapshots remain available.

## Legal / ToS posture

- Google Maps data is accessed via Apify (a third-party scraping platform)
  on their free tier. This is a gray area — Google Maps ToS prohibit
  scraping, but Apify assumes that liability. Personal-use, low-volume,
  read-only posture.
- Prefer official/open datasets (DataSF, SEC EDGAR) for validation and
  enrichment wherever possible.
- Where direct scraping is used (company websites), stay conservative:
  respect `robots.txt`, avoid sites that actively block scrapers (LinkedIn
  excluded — see [Enrichment coverage gap](#enrichment-coverage-gap)),
  keep request rates low.
- Not for redistribution or commercial use — personal-use posture informs
  the risk tolerance above; revisit if that ever changes.
