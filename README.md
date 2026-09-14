# Geospatial Company Discovery

Find companies near a map location by pulling from Google Maps, public business
registries, and industry datasets, then cross-referencing and deduplicating
the results into a searchable local database.

Built for personal use. No accounts, no cloud hosting, no auth. One user,
one machine, one SQLite file.

```
"Find software engineering companies within 5 miles of downtown San Francisco"
```

## How it works

Data moves through three phases, each runnable on its own:

1. **Crawl** pulls company records from external sources into raw archives
   and per-source staging tables.
2. **Process** reads staging tables, geocodes addresses, deduplicates across
   sources, cross-references, and writes clean results to production tables.
3. **Query** serves production data over a local API or prints it from the
   command line.

The frontend pins companies on a Leaflet map, groups them by street address,
and shows provenance (which source, when crawled, confidence score) for every
data point. There's also a sortable table view for scanning results without
clicking pins one by one.


## Data sources

| Source | What it provides |
|--------|-----------------|
| **Apify Google Maps Extractor** | Company name, address, coordinates, category, website, phone. Free tier gives ~1,000 places/month. |
| **DataSF Registered Business Locations** | Official SF business registry. Used to validate Google Maps results and catch businesses Google misses. |
| **Usearch.com** (130+ industry datasets) | HQ address, industry, sub-industry, revenue, employee count, website, NAICS/SIC codes. Covers AI, fintech, biotech, SaaS, manufacturing, and dozens more verticals. |
| **Nominatim (OSM)** | Geocoding for user-entered search locations. Rate-limited to ~1 req/sec per its usage policy. |
| **US Census Bureau batch geocoder** | Bulk geocoding for Usearch addresses. Free, no auth, up to 10k addresses per request. |
| **Company websites + SEC EDGAR** | Best-effort enrichment for employee count and revenue on public companies. |


## Prerequisites

- Node.js (v20+)
- npm
- An Apify API token (free tier works) stored in `.env` as `APIFY_TOKEN`


## Setup

```bash
git clone <repo-url>
cd geospatial-company-discovery

npm install
cd frontend && npm install && cd ..

cp .env.example .env
# Add your APIFY_TOKEN to .env
```


## Crawling data

Each crawl command fetches from one source, saves the raw response, and
populates a staging table. They're idempotent; re-running upserts via
source-specific unique IDs without duplicating or wiping previous data.

### Google Maps (via Apify)

```bash
npm run crawl:google-maps -- --location "San Francisco, CA" --radius 5
npm run crawl:google-maps -- --lat 37.77 --lng -122.42 --radius 3
npm run crawl:google-maps -- --lat 37.78 --lng -122.41 --radius 5 --max-results 500
```

Searches five exact Google Business Profile categories (software company,
computer support and services, computer consultant, computer security
service, automation company). Default 500 results per term. Logs Apify
credit usage and warns when approaching the monthly free-tier limit.

### DataSF business registry

```bash
npm run crawl:datasf
```

Downloads the full "Registered Business Locations" dataset. SF-specific.

### Usearch industry datasets

Usearch has a two-phase crawl. First you pull raw data for a specific
dataset, then you normalize it into the staging table.

```bash
# Crawl a specific dataset into usearch_raw_crawl
npm run crawl:usearch -- --dataset software-companies
npm run crawl:usearch -- --dataset ai-startups --max-pages 10

# Normalize all raw data into staging_usearch
npm run crawl:usearch -- --stage

# Or normalize just one dataset
npm run crawl:usearch -- --stage --dataset software-companies
```

Run `--dataset` for as many verticals as you want (there are 130+),
then `--stage` once to normalize everything.

### Enrichment

```bash
npm run crawl:enrichment
```

Reads companies from staging tables and scrapes additional data from
company websites and SEC EDGAR. Writes to `staging_enrichment`.


## Processing

Once you've crawled, run the process pipeline to merge staging data
into production tables:

```bash
npm run process
npm run process -- --source google_maps   # process only one source
```

What it does, in order:

1. Collects all records from staging tables
2. Parses addresses with `vladdress` into structured components
   (address1, address2, city, state, zip). Unparseable addresses are
   kept as raw strings with failures logged
3. Geocodes addresses missing coordinates (Census batch geocoder first,
   Nominatim fallback for stragglers)
4. Deduplicates by name similarity, website match, and address proximity.
   Address rows are shared across companies at the same building;
   suite/unit info goes into `company_addresses.address2`
5. Cross-references Google Maps results against DataSF (companies confirmed
   by both sources get a confidence boost)
6. Writes to production `companies`, `addresses`, `company_addresses`
7. Applies enrichment attributes from `staging_enrichment`
8. Attaches revenue and employee count from Usearch staging data

You can re-run this at any time without re-crawling. It reads from
staging tables and raw archives, then rebuilds production tables from
scratch.


## Querying

### CLI

```bash
npm run query -- --location "San Francisco, CA" --radius 5
npm run query -- --lat 37.77 --lng -122.42 --radius 3
npm run query -- --lat 37.77 --lng -122.42 --radius 5 --format csv
```

Queries production tables directly. No running server needed.

### API server

```bash
npm run server        # production
npm run dev           # with file watching
```

Runs on `http://localhost:3001` by default (set `PORT` in `.env`
to change it).

**Endpoints:**

```
GET /api/query?lat=37.77&lng=-122.42&radius_miles=5
GET /api/query?location=San+Francisco&radius_miles=5
GET /api/stats
```

`/api/query` returns `{ center, radius_miles, count, companies }`.
`/api/stats` returns row counts for production tables.

### Frontend

```bash
cd frontend && npm run build && cd ..
npm run server
```

Or for development with hot reload:

```bash
npm run dev:frontend   # Vite dev server for the frontend
npm run dev            # Express backend with file watching
```

Three-pane layout: search box on the left, Leaflet map in the center,
detail panel on the right. Plus a sortable/filterable table view below
the map.


## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React v19, TypeScript, Leaflet, Vite |
| Backend | Node.js, Express 5, TypeScript |
| Database | SQLite via better-sqlite3 |
| Spatial queries | Custom `haversine_distance` UDF (no SpatiaLite) |
| Address parsing | vladdress |
| CLI tooling | yargs, tsx |
| Geocoding | Nominatim (interactive), US Census (bulk) |


## Project structure

```
src/
  crawl/
    google-maps.ts      # Apify Google Maps crawler
    datasf.ts           # DataSF open dataset crawler
    usearch.ts          # Usearch multi-dataset crawler
    enrichment.ts       # Website/SEC EDGAR enrichment
  process/
    index.ts            # Staging → production pipeline
  query/
    index.ts            # Spatial query logic + CLI
  server/
    index.ts            # Express API server
  db/
    connection.ts       # SQLite connection + haversine UDF
    schema.ts           # All table DDL
  shared/
    types.ts            # Shared TypeScript types
    interfaces.ts       # Provider abstraction interfaces
    geocode.ts          # Nominatim + Census geocoding
frontend/
  src/
    App.tsx             # Main app shell
    components/
      SearchPanel.tsx   # Location + radius input
      MapView.tsx       # Leaflet map with markers
      DetailPanel.tsx   # Selected company details
      TableView.tsx     # Sortable company table
data/
  discovery.db          # SQLite database (gitignored)
  raw/                  # Raw JSON archives per source (gitignored)
docs/
  SPEC.md               # Full specification
```


## Database layers

**Raw archive** preserves full API responses. Google Maps and DataSF
store these as JSON files in `data/raw/{source}/{timestamp}.json`.
Usearch stores raw rows in the `usearch_raw_crawl` SQLite table.

**Staging tables** (`staging_google_maps`, `staging_datasf`,
`staging_usearch`, `staging_enrichment`) extract the fields needed for
cross-referencing and dedup. One table per source, schema matches what
the source provides.

**Production tables** (`companies`, `addresses`, `company_addresses`,
`company_attributes`) hold the clean, deduplicated output. Only the
process pipeline writes to these; the query API and frontend only read
from them. The `addresses` table has one row per building/geolocation
(no suite/unit info); company-specific unit details live in
`company_addresses.address2`.

Every data point carries `source`, `source_id`, `crawled_at` (using
source-specific data dates: `published_at` for Usearch, `scrapedAt`
for Google Maps, `start_date` for DataSF), and `confidence` (0.0-1.0).
Company attributes like revenue and employee count allow multiple
observations from different sources to coexist rather than overwriting
each other.


## Known limitations

Google Maps returns ~30-40% noise from SEO and virtual-address
businesses. The process step cross-references against DataSF to catch
some of this, but filtering isn't perfect.

Search terms match exact Google Business Profile categories for high
precision (~94% of results are relevant tech/IT companies), but this
excludes non-tech companies that employ software engineers. About 6%
noise from adjacent categories (hardware stores, phone repair shops)
bleeds in and can be filtered during processing.

Employee count and revenue for private companies are mostly unavailable.
LinkedIn has this data but scraping it violates its ToS, so it's
excluded. Most small/private companies will show "unknown" for these
fields. This is an accepted tradeoff.

Data doesn't refresh automatically. Re-run the crawl commands and
`npm run process` when you want fresh data.


## Legal posture

Google Maps data comes through Apify (they assume the scraping
liability). Usearch data is fetched from their public unauthenticated
API. DataSF and Census data are official open datasets. Where direct
scraping is used (company websites), the tool respects `robots.txt`
and keeps request rates low. Not for redistribution or commercial use.
