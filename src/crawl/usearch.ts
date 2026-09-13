import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';

const COMPANY_API_URL =
  'https://usearch.com/api/DataSetGlossary/GetDataSetRowsByFriendlyUrl';
const PAGE_SIZE = 1000;
const REQUEST_DELAY_MS = 500;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

export const USEARCH_DATASETS = [
  { name: 'AI Startups', tag: 'AI', friendlyUrl: 'ai-startups' },
  { name: 'Fintech Startups', tag: 'Fintech', friendlyUrl: 'fintech-startups' },
  { name: 'Biotech Startups', tag: 'Biotech', friendlyUrl: 'biotech-startups' },
  { name: 'Healthcare Companies', tag: 'Healthcare', friendlyUrl: 'healthcare-companies' },
  { name: 'Healthcare Startups', tag: 'Healthcare', friendlyUrl: 'healthcare-startups' },
  { name: 'Health Tech Startups', tag: 'Health Tech', friendlyUrl: 'health-tech-startups' },
  { name: 'Food Tech Startups', tag: 'Food Tech', friendlyUrl: 'food-tech-startups' },
  { name: 'Cybersecurity Startups', tag: 'Cybersecurity', friendlyUrl: 'cybersecurity-startups' },
  { name: 'SaaS Startups', tag: 'SaaS', friendlyUrl: 'saas-startups' },
  { name: 'Crypto Startups', tag: 'Crypto', friendlyUrl: 'crypto-startups' },
  { name: 'Energy Companies', tag: 'Energy', friendlyUrl: 'energy-companies' },
  { name: 'Energy Startups', tag: 'Energy', friendlyUrl: 'energy-startups' },
  { name: 'Finance Startups', tag: 'Finance', friendlyUrl: 'finance-startups' },
  { name: 'Software Companies', tag: 'Software', friendlyUrl: 'software-companies' },
  { name: 'Software Startups', tag: 'Software', friendlyUrl: 'software-startups' },
  { name: 'Robotics Startups', tag: 'Robotics', friendlyUrl: 'robotics-startups' },
  { name: 'Aerospace Companies', tag: 'Aerospace', friendlyUrl: 'aerospace-companies' },
  { name: 'Aerospace Startups', tag: 'Aerospace', friendlyUrl: 'aerospace-startups' },
  { name: 'Edtech Startups', tag: 'Edtech', friendlyUrl: 'edtech-startups' },
  { name: 'Climate Tech Startups', tag: 'Climate Tech', friendlyUrl: 'climate-tech-startups' },
  { name: 'Gaming Companies', tag: 'Gaming', friendlyUrl: 'gaming-companies' },
  { name: 'Gaming Startups', tag: 'Gaming', friendlyUrl: 'gaming-startups' },
  { name: 'Fashion Tech Startups', tag: 'Fashion Tech', friendlyUrl: 'fashion-tech-startups' },
  { name: 'Space Startups', tag: 'Space', friendlyUrl: 'space-startups' },
  { name: 'Construction Companies', tag: 'Construction', friendlyUrl: 'construction-companies' },
  { name: 'Construction Startups', tag: 'Construction', friendlyUrl: 'construction-startups' },
  { name: 'Sustainable Startups', tag: 'Sustainable', friendlyUrl: 'sustainable-startups' },
  { name: 'Ecommerce Startups', tag: 'Ecommerce', friendlyUrl: 'ecommerce-startups' },
  { name: 'Semiconductor Startups', tag: 'Semiconductor', friendlyUrl: 'semiconductor-startups' },
  { name: 'Hardware Startups', tag: 'Hardware', friendlyUrl: 'hardware-startups' },
  { name: 'Proptech Startups', tag: 'Proptech', friendlyUrl: 'proptech-startups' },
  { name: 'Defense Companies', tag: 'Defense', friendlyUrl: 'defense-companies' },
  { name: 'Defense Startups', tag: 'Defense', friendlyUrl: 'defense-startups' },
  { name: 'Quantum Computing Startups', tag: 'Quantum Computing', friendlyUrl: 'quantum-computing-startups' },
  { name: 'Electric Vehicle Startups', tag: 'Electric Vehicle', friendlyUrl: 'electric-vehicle-startups' },
  { name: 'Medical Device Companies', tag: 'Medical Device', friendlyUrl: 'medical-device-companies' },
  { name: 'Medical Device Startups', tag: 'Medical Device', friendlyUrl: 'medical-device-startups' },
  { name: 'Data Analytics Startups', tag: 'Data Analytics', friendlyUrl: 'data-analytics-startups' },
  { name: 'Real Estate Tech Startups', tag: 'Real Estate Tech', friendlyUrl: 'real-estate-tech-startups' },
  { name: 'Beauty Startups', tag: 'Beauty', friendlyUrl: 'beauty-startups' },
  { name: 'Agriculture Companies', tag: 'Agriculture', friendlyUrl: 'agriculture-companies' },
  { name: 'Agriculture Startups', tag: 'Agriculture', friendlyUrl: 'agriculture-startups' },
  { name: 'Insurtech Startups', tag: 'Insurtech', friendlyUrl: 'insurtech-startups' },
  { name: 'Travel Companies', tag: 'Travel', friendlyUrl: 'travel-companies' },
  { name: 'Travel Startups', tag: 'Travel', friendlyUrl: 'travel-startups' },
  { name: 'Battery Startups', tag: 'Battery', friendlyUrl: 'battery-startups' },
  { name: 'Sports Tech Startups', tag: 'Sports Tech', friendlyUrl: 'sports-tech-startups' },
  { name: 'Green Tech Startups', tag: 'Green Tech', friendlyUrl: 'green-tech-startups' },
  { name: 'Automotive Companies', tag: 'Automotive', friendlyUrl: 'automotive-companies' },
  { name: 'Automotive Startups', tag: 'Automotive', friendlyUrl: 'automotive-startups' },
  { name: 'Supply Chain Startups', tag: 'Supply Chain', friendlyUrl: 'supply-chain-startups' },
  { name: 'Food Companies', tag: 'Food', friendlyUrl: 'food-companies' },
  { name: 'Food Startups', tag: 'Food', friendlyUrl: 'food-startups' },
  { name: 'Generative AI Startups', tag: 'Generative AI', friendlyUrl: 'generative-ai-startups' },
  { name: 'Solar Companies', tag: 'Solar', friendlyUrl: 'solar-companies' },
  { name: 'Solar Startups', tag: 'Solar', friendlyUrl: 'solar-startups' },
  { name: 'Fashion Startups', tag: 'Fashion', friendlyUrl: 'fashion-startups' },
  { name: 'Deep Tech Startups', tag: 'Deep Tech', friendlyUrl: 'deep-tech-startups' },
  { name: 'Manufacturing Companies', tag: 'Manufacturing', friendlyUrl: 'manufacturing-companies' },
  { name: 'Manufacturing Startups', tag: 'Manufacturing', friendlyUrl: 'manufacturing-startups' },
  { name: 'Retail Companies', tag: 'Retail', friendlyUrl: 'retail-companies' },
  { name: 'Retail Startups', tag: 'Retail', friendlyUrl: 'retail-startups' },
  { name: 'Industrial Startups', tag: 'Industrial', friendlyUrl: 'industrial-startups' },
  { name: 'Media Startups', tag: 'Media', friendlyUrl: 'media-startups' },
  { name: 'AI Chip Startups', tag: 'AI Chip', friendlyUrl: 'ai-chip-startups' },
  { name: 'Medtech Startups', tag: 'Medtech', friendlyUrl: 'medtech-startups' },
  { name: 'Social Media Startups', tag: 'Social Media', friendlyUrl: 'social-media-startups' },
  { name: 'Nuclear Fusion Startups', tag: 'Nuclear Fusion', friendlyUrl: 'nuclear-fusion-startups' },
  { name: 'AdTech Startups', tag: 'AdTech', friendlyUrl: 'adtech-startups' },
  { name: 'Drone Startups', tag: 'Drone', friendlyUrl: 'drone-startups' },
  { name: 'Mental Health Startups', tag: 'Mental Health', friendlyUrl: 'mental-health-startups' },
  { name: 'Mobility Startups', tag: 'Mobility', friendlyUrl: 'mobility-startups' },
  { name: 'Marketplace Startups', tag: 'Marketplace', friendlyUrl: 'marketplace-startups' },
  { name: 'EV Charging Startups', tag: 'EV Charging', friendlyUrl: 'ev-charging-startups' },
  { name: 'Music Startups', tag: 'Music', friendlyUrl: 'music-startups' },
  { name: 'Web3 Startups', tag: 'Web3', friendlyUrl: 'web3-startups' },
  { name: 'Carbon Capture Startups', tag: 'Carbon Capture', friendlyUrl: 'carbon-capture-startups' },
  { name: 'Cloud Security Startups', tag: 'Cloud Security', friendlyUrl: 'cloud-security-startups' },
  { name: 'Pharmaceutical Companies', tag: 'Pharmaceutical', friendlyUrl: 'pharmaceutical-companies' },
  { name: 'Pharmaceutical Startups', tag: 'Pharmaceutical', friendlyUrl: 'pharmaceutical-startups' },
  { name: 'Cloud Startups', tag: 'Cloud', friendlyUrl: 'cloud-startups' },
  { name: 'HRTech Startups', tag: 'HRTech', friendlyUrl: 'hrtech-startups' },
  { name: 'Education Startups', tag: 'Education', friendlyUrl: 'education-startups' },
  { name: 'HR Startups', tag: 'HR', friendlyUrl: 'hr-startups' },
  { name: 'Martech Startups', tag: 'Martech', friendlyUrl: 'martech-startups' },
  { name: 'Cloud Computing Startups', tag: 'Cloud Computing', friendlyUrl: 'cloud-computing-startups' },
  { name: 'Hydrogen Startups', tag: 'Hydrogen', friendlyUrl: 'hydrogen-startups' },
  { name: 'Pharma Startups', tag: 'Pharma', friendlyUrl: 'pharma-startups' },
  { name: 'Digital Health Startups', tag: 'Digital Health', friendlyUrl: 'digital-health-startups' },
  { name: 'Nuclear Energy Startups', tag: 'Nuclear Energy', friendlyUrl: 'nuclear-energy-startups' },
  { name: 'Aviation Startups', tag: 'Aviation', friendlyUrl: 'aviation-startups' },
  { name: 'Environmental Companies', tag: 'Environmental', friendlyUrl: 'environmental-companies' },
  { name: 'Environmental Startups', tag: 'Environmental', friendlyUrl: 'environmental-startups' },
  { name: 'Consumer Startups', tag: 'Consumer', friendlyUrl: 'consumer-startups' },
  { name: 'Art Startups', tag: 'Art', friendlyUrl: 'art-startups' },
  { name: 'Childcare Startups', tag: 'Childcare', friendlyUrl: 'childcare-startups' },
  { name: 'Femtech Startups', tag: 'Femtech', friendlyUrl: 'femtech-startups' },
  { name: 'Fitness Startups', tag: 'Fitness', friendlyUrl: 'fitness-startups' },
  { name: 'Payments Startups', tag: 'Payments', friendlyUrl: 'payments-startups' },
  { name: 'Banking Startups', tag: 'Banking', friendlyUrl: 'banking-startups' },
  { name: 'Home Care Startups', tag: 'Home Care', friendlyUrl: 'home-care-startups' },
  { name: 'Furniture Companies', tag: 'Furniture', friendlyUrl: 'furniture-companies' },
  { name: 'Furniture Startups', tag: 'Furniture', friendlyUrl: 'furniture-startups' },
  { name: 'Cannabis Companies', tag: 'Cannabis', friendlyUrl: 'cannabis-companies' },
  { name: 'Cannabis Startups', tag: 'Cannabis', friendlyUrl: 'cannabis-startups' },
  { name: 'Sports Betting Startups', tag: 'Sports Betting', friendlyUrl: 'sports-betting-startups' },
  { name: 'Engineering Startups', tag: 'Engineering', friendlyUrl: 'engineering-startups' },
  { name: 'ESG Startups', tag: 'ESG', friendlyUrl: 'esg-startups' },
  { name: 'Big Data Startups', tag: 'Big Data', friendlyUrl: 'big-data-startups' },
  { name: 'Telehealth Startups', tag: 'Telehealth', friendlyUrl: 'telehealth-startups' },
  { name: 'DevOps Startups', tag: 'DevOps', friendlyUrl: 'devops-startups' },
  { name: 'CPG Startups', tag: 'CPG', friendlyUrl: 'cpg-startups' },
  { name: 'VR Startups', tag: 'VR', friendlyUrl: 'vr-startups' },
  { name: 'Edge Computing Startups', tag: 'Edge Computing', friendlyUrl: 'edge-computing-startups' },
  { name: 'Vertical Farming Startups', tag: 'Vertical Farming', friendlyUrl: 'vertical-farming-startups' },
  { name: 'Analytics Startups', tag: 'Analytics', friendlyUrl: 'analytics-startups' },
  { name: 'Coffee Startups', tag: 'Coffee', friendlyUrl: 'coffee-startups' },
  { name: 'Data Science Startups', tag: 'Data Science', friendlyUrl: 'data-science-startups' },
  { name: 'Pharmacy Startups', tag: 'Pharmacy', friendlyUrl: 'pharmacy-startups' },
  { name: 'Computer Vision Startups', tag: 'Computer Vision', friendlyUrl: 'computer-vision-startups' },
  { name: 'AutoML Startups', tag: 'AutoML', friendlyUrl: 'automl-startups' },
  { name: 'Car Insurance Startups', tag: 'Car Insurance', friendlyUrl: 'car-insurance-startups' },
  { name: 'Climate Startups', tag: 'Climate', friendlyUrl: 'climate-startups' },
  { name: 'Boulder Startups', tag: 'Boulder', friendlyUrl: 'boulder-startups' },
  { name: 'MLOps Startups', tag: 'MLOps', friendlyUrl: 'mlops-startups' },
  { name: 'Psychedelics Startups', tag: 'Psychedelics', friendlyUrl: 'psychedelics-startups' },
  { name: 'Advertising Companies', tag: 'Advertising', friendlyUrl: 'advertising-companies' },
  { name: 'Bus Companies', tag: 'Bus', friendlyUrl: 'bus-companies' },
  { name: 'Cable Companies', tag: 'Cable', friendlyUrl: 'cable-companies' },
  { name: 'Cleaning Companies', tag: 'Cleaning', friendlyUrl: 'cleaning-companies' },
  { name: 'Cosmetics Companies', tag: 'Cosmetics', friendlyUrl: 'cosmetics-companies' },
  { name: 'Distribution Companies', tag: 'Distribution', friendlyUrl: 'distribution-companies' },
  { name: 'Electronics Companies', tag: 'Electronics', friendlyUrl: 'electronics-companies' },
  { name: 'Glass Companies', tag: 'Glass', friendlyUrl: 'glass-companies' },
  { name: 'Graphic Design Companies', tag: 'Graphic Design', friendlyUrl: 'graphic-design-companies' },
  { name: 'Investment Companies', tag: 'Investment', friendlyUrl: 'investment-companies' },
  { name: 'Logistics Companies', tag: 'Logistics', friendlyUrl: 'logistics-companies' },
  { name: 'Marketing Companies', tag: 'Marketing', friendlyUrl: 'marketing-companies' },
  { name: 'Moving Companies', tag: 'Moving', friendlyUrl: 'moving-companies' },
  { name: 'NLP Startups', tag: 'NLP', friendlyUrl: 'nlp-startups' },
  { name: 'Oil and Gas Companies', tag: 'Oil and Gas', friendlyUrl: 'oil-and-gas-companies' },
  { name: 'Packaging Companies', tag: 'Packaging', friendlyUrl: 'packaging-companies' },
  { name: 'Plastic Companies', tag: 'Plastic', friendlyUrl: 'plastic-companies' },
  { name: 'Private Equity Companies', tag: 'Private Equity', friendlyUrl: 'private-equity-companies' },
  { name: 'Railroad Companies', tag: 'Railroad', friendlyUrl: 'railroad-companies' },
  { name: 'Real Estate Companies', tag: 'Real Estate', friendlyUrl: 'real-estate-companies' },
  { name: 'Record Label Companies', tag: 'Record Label', friendlyUrl: 'record-label-companies' },
  { name: 'Recycling Companies', tag: 'Recycling', friendlyUrl: 'recycling-companies' },
  { name: 'Renewable Energy Companies', tag: 'Renewable Energy', friendlyUrl: 'renewable-energy-companies' },
  { name: 'Security Companies', tag: 'Security', friendlyUrl: 'security-companies' },
  { name: 'Shipping Companies', tag: 'Shipping', friendlyUrl: 'shipping-companies' },
  { name: 'Staffing Companies', tag: 'Staffing', friendlyUrl: 'staffing-companies' },
  { name: 'Supplements Companies', tag: 'Supplements', friendlyUrl: 'supplements-companies' },
  { name: 'Telecommunication Companies', tag: 'Telecommunication', friendlyUrl: 'telecommunication-companies' },
  { name: 'Toy Companies', tag: 'Toy', friendlyUrl: 'toy-companies' },
  { name: 'Transportation Companies', tag: 'Transportation', friendlyUrl: 'transportation-companies' },
  { name: 'Trucking Companies', tag: 'Trucking', friendlyUrl: 'trucking-companies' },
  { name: 'Venture Capital Companies', tag: 'Venture Capital', friendlyUrl: 'venture-capital-companies' },
  { name: 'Waste Companies', tag: 'Waste', friendlyUrl: 'waste-companies' },
] as const;

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

function fieldVal(row: UsearchRow, name: string): string {
  return row[name]?.value?.trim() ?? '';
}

function isStartupsDataset(dataset: string): boolean {
  return dataset.endsWith('-startups');
}

function normalizeRow(row: UsearchRow, dataset: string) {
  const startup = isStartupsDataset(dataset);
  return {
    usearch_id: fieldVal(row, 'RowHash') || null,
    dataset,
    company_name: fieldVal(row, startup ? 'Venture Name' : 'Company Name'),
    address: fieldVal(row, startup ? 'Venture Headquarters' : 'Headquarters') || null,
    city: startup ? null : fieldVal(row, 'City') || null,
    state: startup ? null : fieldVal(row, 'State') || null,
    zip: startup ? null : fieldVal(row, 'Zip Code') || null,
    country: startup ? null : fieldVal(row, 'Country') || null,
    website: fieldVal(row, startup ? 'Venture Website' : 'Website') || null,
    industry: fieldVal(row, 'Industry') || null,
    sub_industry: fieldVal(row, startup ? 'Venture Industry' : 'Sub Industry') || null,
    revenue: fieldVal(row, startup ? 'Venture Revenue' : 'Revenue') || null,
    employee_count: fieldVal(row, startup ? 'Venture Employees' : 'Employees') || null,
    phone_number: startup ? null : fieldVal(row, 'Phone Number') || null,
    naics_code: startup ? null : fieldVal(row, 'NAICS Code') || null,
    sic_code: startup ? null : fieldVal(row, 'SIC Code') || null,
    linkedin_url: fieldVal(row, startup ? 'Venture LinkedIn' : 'LinkedIn URL') || null,
    zoominfo_url: startup ? null : fieldVal(row, 'ZoomInfo URL') || null,
    source_url: fieldVal(row, 'Src') || null,
    published_at: fieldVal(row, 'Published Date') || null,
    raw_json: JSON.stringify(row),
  };
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

async function crawlRaw(friendlyUrl: string, maxPages?: number) {
  const db = getDb();
  initSchema(db);

  const crawlRun = new Date().toISOString().replace(/[:.]/g, '-');
  const crawledAt = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT INTO usearch_raw_crawl (dataset, row_hash, raw_json, crawl_run, crawled_at)
    VALUES (@dataset, @row_hash, @raw_json, @crawl_run, @crawled_at)
    ON CONFLICT(dataset, row_hash) DO UPDATE SET
      raw_json = excluded.raw_json, crawl_run = excluded.crawl_run, crawled_at = excluded.crawled_at
  `);

  const firstPage = await fetchPage(friendlyUrl, 1);
  const totalPages = Math.min(firstPage.totalPages, maxPages ?? Infinity);
  console.log(`Raw crawl: ${firstPage.total} total rows in "${friendlyUrl}", ${totalPages} pages`);

  let inserted = 0;

  const insertPage = db.transaction((rows: UsearchRow[]) => {
    for (const row of rows) {
      const rowHash = row['RowHash']?.value?.trim() || null;
      upsert.run({
        dataset: friendlyUrl,
        row_hash: rowHash,
        raw_json: JSON.stringify(row),
        crawl_run: crawlRun,
        crawled_at: crawledAt,
      });
      inserted++;
    }
  });

  insertPage(firstPage.rowsForDisplay);
  console.log(`  page 1/${totalPages} (${firstPage.rowsForDisplay.length} rows)`);

  for (let page = 2; page <= totalPages; page++) {
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));

    try {
      const data = await fetchPage(friendlyUrl, page);
      insertPage(data.rowsForDisplay);
      if (page % 10 === 0 || page === totalPages) {
        console.log(`  page ${page}/${totalPages} (${inserted} rows so far)`);
      }
    } catch (err) {
      console.warn(`  page ${page} failed, skipping: ${err}`);
    }
  }

  console.log(`Done: ${inserted} rows upserted into usearch_raw_crawl for "${friendlyUrl}"`);
  closeDb();
}

function stageFromRaw(dataset?: string) {
  const db = getDb();
  initSchema(db);

  const upsert = db.prepare(`
    INSERT INTO staging_usearch (
      usearch_id, dataset, company_name, address, city, state, zip, country,
      website, industry, sub_industry, revenue, employee_count, phone_number,
      naics_code, sic_code, linkedin_url, zoominfo_url, source_url, published_at,
      raw_json, crawl_run, crawled_at
    ) VALUES (
      @usearch_id, @dataset, @company_name, @address, @city, @state, @zip, @country,
      @website, @industry, @sub_industry, @revenue, @employee_count, @phone_number,
      @naics_code, @sic_code, @linkedin_url, @zoominfo_url, @source_url, @published_at,
      @raw_json, @crawl_run, @crawled_at
    )
    ON CONFLICT(dataset, usearch_id) DO UPDATE SET
      company_name = excluded.company_name, address = excluded.address,
      city = excluded.city, state = excluded.state, zip = excluded.zip, country = excluded.country,
      website = excluded.website, industry = excluded.industry, sub_industry = excluded.sub_industry,
      revenue = excluded.revenue, employee_count = excluded.employee_count,
      phone_number = excluded.phone_number, naics_code = excluded.naics_code,
      sic_code = excluded.sic_code, linkedin_url = excluded.linkedin_url,
      zoominfo_url = excluded.zoominfo_url, source_url = excluded.source_url,
      published_at = excluded.published_at,
      raw_json = excluded.raw_json, crawl_run = excluded.crawl_run, crawled_at = excluded.crawled_at
  `);

  const query = dataset
    ? db.prepare('SELECT dataset, row_hash, raw_json, crawl_run, crawled_at FROM usearch_raw_crawl WHERE dataset = ?')
    : db.prepare('SELECT dataset, row_hash, raw_json, crawl_run, crawled_at FROM usearch_raw_crawl');

  const rows = dataset ? query.all(dataset) : query.all();
  console.log(`Staging ${rows.length} raw rows${dataset ? ` from "${dataset}"` : ' (all datasets)'}...`);

  let staged = 0;
  let skipped = 0;

  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize) as Array<{
      dataset: string;
      row_hash: string;
      raw_json: string;
      crawl_run: string;
      crawled_at: string;
    }>;

    db.transaction(() => {
      for (const rawRow of batch) {
        const row = JSON.parse(rawRow.raw_json) as UsearchRow;
        const normalized = normalizeRow(row, rawRow.dataset);
        if (!normalized.company_name) {
          skipped++;
          continue;
        }
        upsert.run({
          ...normalized,
          crawl_run: rawRow.crawl_run,
          crawled_at: rawRow.crawled_at,
        });
        staged++;
      }
    })();
  }

  console.log(`Staged: ${staged}, skipped (no name): ${skipped}`);
  closeDb();
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('dataset', {
      type: 'string',
      describe: 'Dataset friendlyUrl slug (required for crawl, optional for --stage)',
    })
    .option('stage', {
      type: 'boolean',
      describe: 'Normalize usearch_raw_crawl into staging_usearch',
    })
    .option('max-pages', {
      type: 'number',
      describe: 'Max pages to fetch (crawl mode only)',
    })
    .parse();

  const dataset = argv.dataset as string | undefined;

  if (argv.stage) {
    stageFromRaw(dataset);
    return;
  }

  if (!dataset) {
    console.error('Usage:');
    console.error('  --dataset <slug>              Crawl a dataset into usearch_raw_crawl');
    console.error('  --stage                       Normalize all raw data into staging_usearch');
    console.error('  --stage --dataset <slug>      Normalize a specific dataset');
    process.exit(1);
  }

  const known = USEARCH_DATASETS.find((d) => d.friendlyUrl === dataset);
  if (known) {
    console.log(`Dataset: ${known.name} [${known.tag}]`);
  }
  await crawlRaw(dataset, argv.maxPages as number | undefined);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
