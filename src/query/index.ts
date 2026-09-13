import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { geocodeNominatim } from '../shared/geocode.js';
import type { QueryResult, Company, Address, CompanyAttribute } from '../shared/types.js';

export function queryCompanies(
  lat: number,
  lng: number,
  radiusMiles: number,
): QueryResult[] {
  const db = getDb();
  initSchema(db);

  const rows = db
    .prepare(
      `
    SELECT
      c.id as company_id,
      c.canonical_name,
      c.aliases as company_aliases,
      c.category,
      c.website,
      c.source as company_source,
      c.source_id as company_source_id,
      c.crawled_at as company_crawled_at,
      a.id as address_id,
      a.address1,
      ca.address2,
      a.city,
      a.state,
      a.zip,
      a.country,
      a.lat,
      a.lng,
      a.source as address_source,
      a.source_id as address_source_id,
      a.crawled_at as address_crawled_at,
      ca.is_headquarters,
      ca.phone,
      ca.confidence,
      haversine_distance(?, ?, a.lat, a.lng) as distance_miles
    FROM companies c
    JOIN company_addresses ca ON ca.company_id = c.id
    JOIN addresses a ON a.id = ca.address_id
    WHERE haversine_distance(?, ?, a.lat, a.lng) <= ?
    ORDER BY distance_miles ASC
  `,
    )
    .all(lat, lng, lat, lng, radiusMiles) as Array<Record<string, unknown>>;

  const results: QueryResult[] = [];

  for (const row of rows) {
    const companyId = row.company_id as number;

    const attributes = db
      .prepare('SELECT * FROM company_attributes WHERE company_id = ?')
      .all(companyId) as CompanyAttribute[];

    results.push({
      company: {
        id: companyId,
        canonical_name: row.canonical_name as string,
        aliases: row.company_aliases as string | null,
        category: row.category as string | null,
        website: row.website as string | null,
        source: row.company_source as string,
        source_id: row.company_source_id as string | null,
        crawled_at: row.company_crawled_at as string,
      },
      address: {
        id: row.address_id as number,
        address1: row.address1 as string,
        city: row.city as string,
        state: row.state as string | null,
        zip: row.zip as string | null,
        country: row.country as string,
        lat: row.lat as number,
        lng: row.lng as number,
        source: row.address_source as string,
        source_id: row.address_source_id as string | null,
        crawled_at: row.address_crawled_at as string,
      },
      address2: (row.address2 as string | null) || null,
      distance_miles: Math.round((row.distance_miles as number) * 100) / 100,
      is_headquarters: Boolean(row.is_headquarters),
      phone: (row.phone as string | null) || null,
      confidence: row.confidence as number,
      attributes,
    });
  }

  return results;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('location', { type: 'string', describe: 'Location name to geocode' })
    .option('lat', { type: 'number', describe: 'Latitude' })
    .option('lng', { type: 'number', describe: 'Longitude' })
    .option('radius', { type: 'number', default: 5, describe: 'Radius in miles' })
    .option('format', {
      type: 'string',
      default: 'json',
      choices: ['json', 'csv'] as const,
      describe: 'Output format',
    })
    .check((a) => {
      if (!a.location && (a.lat === undefined || a.lng === undefined)) {
        throw new Error('Provide --location or --lat and --lng');
      }
      return true;
    })
    .parse();

  let lat: number, lng: number;

  if (argv.location) {
    const point = await geocodeNominatim(argv.location);
    if (!point) {
      console.error(`Could not geocode "${argv.location}"`);
      process.exit(1);
    }
    lat = point.lat;
    lng = point.lng;
    console.error(`Geocoded "${argv.location}" to ${lat}, ${lng}`);
  } else {
    lat = argv.lat!;
    lng = argv.lng!;
  }

  const results = queryCompanies(lat, lng, argv.radius);

  if (argv.format === 'csv') {
    console.log(
      'company,category,website,phone,address,city,state,zip,lat,lng,distance_miles,confidence,source,employee_count,revenue',
    );
    for (const r of results) {
      const empAttr = r.attributes.find((a) => a.attribute_type === 'employee_count');
      const revAttr = r.attributes.find((a) => a.attribute_type === 'revenue');
      const fields = [
        `"${r.company.canonical_name.replace(/"/g, '""')}"`,
        `"${r.company.category || ''}"`,
        r.company.website || '',
        r.phone || '',
        `"${r.address.address1.replace(/"/g, '""')}"`,
        r.address.city,
        r.address.state || '',
        r.address.zip || '',
        r.address.lat,
        r.address.lng,
        r.distance_miles,
        r.confidence,
        r.company.source,
        empAttr?.attribute_value || 'unknown',
        revAttr?.attribute_value || 'unknown',
      ];
      console.log(fields.join(','));
    }
  } else {
    console.log(JSON.stringify(results, null, 2));
  }

  console.error(`\n${results.length} companies within ${argv.radius} miles`);

  closeDb();
}

if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
