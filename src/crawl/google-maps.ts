import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { geocodeNominatim } from '../shared/geocode.js';
import type { ApifyPlace } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACTOR_ID = 'nwua9Gu5YrADL7ZDj';

const SEARCH_TERMS = [
  'software companies',
  'tech companies',
  'computer software company',
  'technology company',
  'IT company',
];

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('location', { type: 'string', describe: 'Location name to geocode' })
    .option('lat', { type: 'number', describe: 'Latitude' })
    .option('lng', { type: 'number', describe: 'Longitude' })
    .option('radius', { type: 'number', default: 5, describe: 'Radius in miles' })
    .option('max-results', {
      type: 'number',
      default: 100,
      describe: 'Max results per search term',
    })
    .check((a) => {
      if (!a.location && (a.lat === undefined || a.lng === undefined)) {
        throw new Error('Provide --location or --lat and --lng');
      }
      return true;
    })
    .parse();

  let lat: number, lng: number;
  // Text location for the actor's polygon — coordinates produce point-sized polygons
  let actorLocation: string;

  if (argv.location) {
    const point = await geocodeNominatim(argv.location);
    if (!point) {
      console.error(`Could not geocode "${argv.location}"`);
      process.exit(1);
    }
    lat = point.lat;
    lng = point.lng;
    actorLocation = argv.location;
    console.log(`Geocoded "${argv.location}" to ${lat}, ${lng}`);
  } else {
    lat = argv.lat!;
    lng = argv.lng!;
    // Reverse-geocode to get a named area for the actor
    const revUrl = new URL('https://nominatim.openstreetmap.org/reverse');
    revUrl.searchParams.set('lat', String(lat));
    revUrl.searchParams.set('lon', String(lng));
    revUrl.searchParams.set('format', 'json');
    revUrl.searchParams.set('zoom', '14');
    const revRes = await fetch(revUrl.toString(), {
      headers: { 'User-Agent': 'geospatial-company-discovery/0.1 (personal tool)' },
    });
    if (revRes.ok) {
      const revData = (await revRes.json()) as { display_name?: string; address?: { city?: string; state?: string; suburb?: string; neighbourhood?: string } };
      const addr = revData.address;
      actorLocation = addr
        ? [addr.neighbourhood || addr.suburb, addr.city, addr.state].filter(Boolean).join(', ')
        : `${lat},${lng}`;
      console.log(`Reverse-geocoded to "${actorLocation}"`);
    } else {
      actorLocation = `${lat},${lng}`;
    }
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error('APIFY_TOKEN not set in .env');
    process.exit(1);
  }

  const client = new ApifyClient({ token });
  const maxPerTerm = argv.maxResults as number;

  console.log(
    `Searching for companies within ${argv.radius} mi of ${lat}, ${lng}...`,
  );
  console.log(
    `Using ${SEARCH_TERMS.length} search terms, max ${maxPerTerm} results each`,
  );

  // Zoom level controls the actor's search area polygon size.
  // Lower zoom = larger area. Calibrated to radius in miles.
  const zoom = argv.radius <= 1 ? 14 : argv.radius <= 3 ? 13 : argv.radius <= 10 ? 12 : 10;

  const run = await client.actor(ACTOR_ID).call({
    searchStringsArray: SEARCH_TERMS,
    locationQuery: actorLocation,
    maxCrawledPlacesPerSearch: maxPerTerm,
    language: 'en',
    zoom,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`Got ${items.length} results from Apify`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawDir = path.resolve(__dirname, '../../data/raw/google_maps');
  fs.mkdirSync(rawDir, { recursive: true });
  const rawPath = path.join(rawDir, `${timestamp}.json`);
  fs.writeFileSync(
    rawPath,
    JSON.stringify(
      {
        meta: {
          lat,
          lng,
          radius: argv.radius,
          searchTerms: SEARCH_TERMS,
          resultCount: items.length,
          runId: run.id,
        },
        results: items,
      },
      null,
      2,
    ),
  );
  console.log(`Raw archive: ${rawPath}`);

  const db = getDb();
  initSchema(db);

  const upsert = db.prepare(`
    INSERT INTO staging_google_maps (place_id, name, address, category, website, phone, lat, lng, raw_json, crawl_run, crawled_at)
    VALUES (@place_id, @name, @address, @category, @website, @phone, @lat, @lng, @raw_json, @crawl_run, @crawled_at)
    ON CONFLICT(place_id) DO UPDATE SET
      name = excluded.name, address = excluded.address, category = excluded.category,
      website = excluded.website, phone = excluded.phone, lat = excluded.lat, lng = excluded.lng,
      raw_json = excluded.raw_json, crawl_run = excluded.crawl_run, crawled_at = excluded.crawled_at
  `);

  const crawledAt = new Date().toISOString();
  let upserted = 0;

  const insertAll = db.transaction(() => {
    for (const raw of items) {
      const item = raw as ApifyPlace;
      const placeId = item.placeId || item.cid;
      const name = item.title || item.name;
      if (!placeId || !name) continue;

      upsert.run({
        place_id: placeId,
        name,
        address: item.address || item.street || null,
        category: item.categoryName || item.category || null,
        website: item.website || null,
        phone: item.phone || item.phoneUnformatted || null,
        lat: item.location?.lat ?? item.lat ?? null,
        lng: item.location?.lng ?? item.lng ?? null,
        raw_json: JSON.stringify(item),
        crawl_run: timestamp,
        crawled_at: crawledAt,
      });
      upserted++;
    }
  });

  insertAll();
  console.log(`Upserted ${upserted} companies into staging_google_maps`);

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
