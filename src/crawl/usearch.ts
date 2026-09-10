import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMPANY_API_URL =
  'https://usearch.com/api/DataSetGlossary/GetDataSetRowsByFriendlyUrl';
const PAGE_SIZE = 1000;
const REQUEST_DELAY_MS = 500;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

interface UsearchFieldValue {
  value: string | null;
}

type UsearchRow = Record<string, UsearchFieldValue>;

interface UsearchApiResponse {
  total: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
  rowsForDisplay: UsearchRow[];
}

interface UsearchCompanyRecord {
  companyName: string;
  industry: string;
  subIndustry: string;
  website: string;
  revenue: string;
  employees: string;
  headquarters: string;
  phoneNumber: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  naicsCode: string;
  sicCode: string;
  sourceUrl: string;
  publishedDate: string;
  rowHash: string;
}

function fieldVal(row: UsearchRow, name: string): string {
  return row[name]?.value?.trim() ?? '';
}

function parseRow(row: UsearchRow): UsearchCompanyRecord {
  return {
    companyName: fieldVal(row, 'Company Name'),
    industry: fieldVal(row, 'Industry'),
    subIndustry: fieldVal(row, 'Sub Industry'),
    website: fieldVal(row, 'Website'),
    revenue: fieldVal(row, 'Revenue'),
    employees: fieldVal(row, 'Employees'),
    headquarters: fieldVal(row, 'Headquarters'),
    phoneNumber: fieldVal(row, 'Phone Number'),
    city: fieldVal(row, 'City'),
    state: fieldVal(row, 'State'),
    zipCode: fieldVal(row, 'Zip Code'),
    country: fieldVal(row, 'Country'),
    naicsCode: fieldVal(row, 'NAICS Code'),
    sicCode: fieldVal(row, 'SIC Code'),
    sourceUrl: fieldVal(row, 'Src'),
    publishedDate: fieldVal(row, 'Published Date'),
    rowHash: fieldVal(row, 'RowHash'),
  };
}

interface CrawlFilter {
  states?: string[];
  cities?: string[];
}

function matchesFilter(record: UsearchCompanyRecord, filter: CrawlFilter): boolean {
  if (filter.states?.length) {
    const normalized = filter.states.map((s) => s.toLowerCase());
    if (!normalized.includes(record.state.toLowerCase())) return false;
  }
  if (filter.cities?.length) {
    const normalized = filter.cities.map((c) => c.toLowerCase());
    if (!normalized.includes(record.city.toLowerCase())) return false;
  }
  return true;
}

async function fetchPage(
  datasetSlug: string,
  pageNumber: number,
): Promise<UsearchApiResponse> {
  const url = new URL(COMPANY_API_URL);
  url.searchParams.set('friendlyUrl', datasetSlug);
  url.searchParams.set('pageNumber', String(pageNumber));
  url.searchParams.set('pageSize', String(PAGE_SIZE));

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': USER_AGENT,
      Referer: `https://usearch.com/dataset/${datasetSlug}`,
      Cookie: 'g_state={"i_l":0}',
    },
  });

  if (!res.ok) {
    throw new Error(`Usearch API ${res.status}: ${res.statusText}`);
  }

  return (await res.json()) as UsearchApiResponse;
}

async function* crawlCompanies(
  datasetSlug: string,
  filter: CrawlFilter,
  maxPages?: number,
): AsyncGenerator<UsearchCompanyRecord> {
  const firstPage = await fetchPage(datasetSlug, 1);
  const totalPages = Math.min(
    firstPage.totalPages,
    maxPages ?? Infinity,
  );

  console.log(
    `Usearch: ${firstPage.total} total records in "${datasetSlug}", ${totalPages} pages to scan`,
  );

  for (const row of firstPage.rowsForDisplay) {
    const record = parseRow(row);
    if (record.companyName && matchesFilter(record, filter)) yield record;
  }

  for (let page = 2; page <= totalPages; page++) {
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    if (page % 50 === 0) {
      console.log(`  page ${page}/${totalPages}`);
    }

    try {
      const data = await fetchPage(datasetSlug, page);
      for (const row of data.rowsForDisplay) {
        const record = parseRow(row);
        if (record.companyName && matchesFilter(record, filter)) yield record;
      }
    } catch (err) {
      console.warn(`  page ${page} failed, skipping: ${err}`);
    }
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('sf', { type: 'boolean', describe: 'San Francisco only' })
    .option('state', { type: 'string', describe: 'Filter by state (full name)' })
    .option('city', { type: 'string', describe: 'Filter by city' })
    .option('dataset', {
      type: 'string',
      default: 'software-companies',
      describe: 'Usearch dataset slug',
    })
    .option('max-pages', {
      type: 'number',
      describe: 'Max pages to fetch',
    })
    .parse();

  const filter: CrawlFilter = {};
  if (argv.sf) {
    filter.cities = ['San Francisco'];
    filter.states = ['California'];
  } else {
    if (argv.city) filter.cities = [argv.city];
    if (argv.state) filter.states = [argv.state];
  }

  const dataset = argv.dataset as string;
  const maxPages = argv.maxPages as number | undefined;

  console.log(`Crawling Usearch ${dataset}...`);
  if (Object.keys(filter).length > 0) {
    console.log(`Filter: ${JSON.stringify(filter)}`);
  }

  const allRecords: UsearchCompanyRecord[] = [];
  for await (const record of crawlCompanies(dataset, filter, maxPages)) {
    allRecords.push(record);
  }

  console.log(`Matched: ${allRecords.length} records after filtering`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawDir = path.resolve(__dirname, '../../data/raw/usearch');
  fs.mkdirSync(rawDir, { recursive: true });
  const rawPath = path.join(rawDir, `${timestamp}.json`);
  fs.writeFileSync(
    rawPath,
    JSON.stringify(
      {
        meta: { source: 'usearch', dataset, filter, recordCount: allRecords.length },
        results: allRecords,
      },
      null,
      2,
    ),
  );
  console.log(`Raw archive: ${rawPath}`);

  const db = getDb();
  initSchema(db);

  const upsert = db.prepare(`
    INSERT INTO staging_usearch (usearch_id, company_name, address, city, state, zip, website, industry, revenue, employee_count, raw_json, crawl_run, crawled_at)
    VALUES (@usearch_id, @company_name, @address, @city, @state, @zip, @website, @industry, @revenue, @employee_count, @raw_json, @crawl_run, @crawled_at)
    ON CONFLICT(usearch_id) DO UPDATE SET
      company_name = excluded.company_name, address = excluded.address, city = excluded.city,
      state = excluded.state, zip = excluded.zip, website = excluded.website,
      industry = excluded.industry, revenue = excluded.revenue, employee_count = excluded.employee_count,
      raw_json = excluded.raw_json, crawl_run = excluded.crawl_run, crawled_at = excluded.crawled_at
  `);

  const crawledAt = new Date().toISOString();
  let upserted = 0;

  const insertAll = db.transaction(() => {
    for (const rec of allRecords) {
      upsert.run({
        usearch_id: rec.rowHash || null,
        company_name: rec.companyName,
        address: rec.headquarters || null,
        city: rec.city || null,
        state: rec.state || null,
        zip: rec.zipCode || null,
        website: rec.website || null,
        industry: rec.subIndustry || rec.industry || null,
        revenue: rec.revenue || null,
        employee_count: rec.employees || null,
        raw_json: JSON.stringify(rec),
        crawl_run: timestamp,
        crawled_at: crawledAt,
      });
      upserted++;
    }
  });

  insertAll();
  console.log(`Upserted ${upserted} companies into staging_usearch`);

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
