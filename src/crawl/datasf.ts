import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DataSF Registered Business Locations — Socrata Open Data API
const DATASF_ENDPOINT =
  'https://data.sfgov.org/resource/g8m3-pdis.json';
const PAGE_SIZE = 5000;

interface DataSFRecord {
  ttxid?: string;
  certificate_number?: string;
  ownership_name?: string;
  dba_name?: string;
  full_business_address?: string;
  city?: string;
  state?: string;
  business_zip?: string;
  naics_code?: string;
  naics_code_description?: string;
  dba_start_date?: string;
  location_start_date?: string;
  [key: string]: unknown;
}

async function fetchPage(offset: number): Promise<DataSFRecord[]> {
  const url = new URL(DATASF_ENDPOINT);
  url.searchParams.set('$limit', String(PAGE_SIZE));
  url.searchParams.set('$offset', String(offset));
  url.searchParams.set('$order', 'ttxid');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'geospatial-company-discovery/0.1' },
  });

  if (!res.ok) throw new Error(`DataSF API ${res.status}: ${res.statusText}`);
  return (await res.json()) as DataSFRecord[];
}

async function main() {
  console.log('Downloading DataSF Registered Business Locations...');

  const allRecords: DataSFRecord[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(offset);
    if (page.length === 0) break;
    allRecords.push(...page);
    console.log(`  Fetched ${allRecords.length} records...`);
    offset += PAGE_SIZE;
  }

  console.log(`Total: ${allRecords.length} records`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawDir = path.resolve(__dirname, '../../data/raw/datasf');
  fs.mkdirSync(rawDir, { recursive: true });
  const rawPath = path.join(rawDir, `${timestamp}.json`);
  fs.writeFileSync(
    rawPath,
    JSON.stringify(
      { meta: { source: 'datasf', recordCount: allRecords.length }, results: allRecords },
      null,
      2,
    ),
  );
  console.log(`Raw archive: ${rawPath}`);

  const db = getDb();
  initSchema(db);

  const upsert = db.prepare(`
    INSERT INTO staging_datasf (datasf_id, business_name, address, city, state, zip, naics_code, naics_desc, start_date, raw_json, crawl_run, crawled_at)
    VALUES (@datasf_id, @business_name, @address, @city, @state, @zip, @naics_code, @naics_desc, @start_date, @raw_json, @crawl_run, @crawled_at)
    ON CONFLICT(datasf_id) DO UPDATE SET
      business_name = excluded.business_name, address = excluded.address, city = excluded.city,
      state = excluded.state, zip = excluded.zip, naics_code = excluded.naics_code,
      naics_desc = excluded.naics_desc, start_date = excluded.start_date,
      raw_json = excluded.raw_json, crawl_run = excluded.crawl_run, crawled_at = excluded.crawled_at
  `);

  const crawledAt = new Date().toISOString();
  let upserted = 0;

  const insertAll = db.transaction(() => {
    for (const rec of allRecords) {
      const id = rec.ttxid || rec.certificate_number;
      const name = rec.dba_name || rec.ownership_name;
      if (!id || !name) continue;

      upsert.run({
        datasf_id: id,
        business_name: name,
        address: rec.full_business_address || null,
        city: rec.city || 'San Francisco',
        state: rec.state || 'CA',
        zip: rec.business_zip || null,
        naics_code: rec.naics_code || null,
        naics_desc: rec.naics_code_description || null,
        start_date: rec.dba_start_date || rec.location_start_date || null,
        raw_json: JSON.stringify(rec),
        crawl_run: timestamp,
        crawled_at: crawledAt,
      });
      upserted++;
    }
  });

  insertAll();
  console.log(`Upserted ${upserted} businesses into staging_datasf`);

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
