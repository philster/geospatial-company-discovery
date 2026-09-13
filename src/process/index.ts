import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { geocodeNominatim, batchGeocodeCensus } from '../shared/geocode.js';

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.'"\-()]/g, '')
    .replace(
      /\b(inc|llc|corp|corporation|co|company|ltd|limited|plc|group|holdings|technologies|technology|tech)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\bst\b/g, 'street')
    .replace(/\bave\b/g, 'avenue')
    .replace(/\bblvd\b/g, 'boulevard')
    .replace(/\bdr\b/g, 'drive')
    .replace(/\bln\b/g, 'lane')
    .replace(/\brd\b/g, 'road')
    .replace(/\bct\b/g, 'court')
    .replace(/\bpl\b/g, 'place')
    .replace(/\bste\b|\b#/g, 'suite ')
    .replace(/[,.'"\-()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  return intersection / Math.max(tokensA.size, tokensB.size);
}

function parseFullAddress(full: string): {
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
} {
  const parts = full.split(',').map((s) => s.trim()).filter(Boolean);

  // Parse from the end: last part is "STATE ZIP", second-to-last is city,
  // everything before is street + unit. This handles multi-comma addresses
  // like "580 California St, 12th Floor, San Francisco, CA 94104".
  let state = '';
  let zip = '';
  let city = '';
  let streetParts: string[] = [];

  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const stateZipMatch = last.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2];
      city = parts[parts.length - 2];
      streetParts = parts.slice(0, -2);
    } else {
      // No state+zip at end — best-effort: last is city, rest is street
      city = parts[parts.length - 1];
      streetParts = parts.slice(0, -1);
    }
  } else if (parts.length === 2) {
    streetParts = [parts[0]];
    city = parts[1];
  } else {
    streetParts = parts;
  }

  let street = streetParts[0] || '';
  let unit = streetParts.slice(1).join(', ');

  const unitMatch = street.match(/\s+(#|ste|suite|unit|apt)\s*(\S+)$/i);
  if (unitMatch) {
    unit = [unitMatch[0].trim(), unit].filter(Boolean).join(', ');
    street = street.slice(0, unitMatch.index).trim();
  }

  return { street, unit, city, state, zip };
}

function addressSimilarity(a: string, b: string): number {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (na === nb) return 1;

  const tokensA = na.split(' ').filter(Boolean);
  const tokensB = nb.split(' ').filter(Boolean);

  if (tokensA[0] === tokensB[0]) {
    let matches = 1;
    for (let i = 1; i < Math.min(tokensA.length, tokensB.length); i++) {
      if (tokensA[i] === tokensB[i]) matches++;
    }
    return matches / Math.max(tokensA.length, tokensB.length);
  }

  return 0;
}

interface PendingCompany {
  name: string;
  address: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  category: string | null;
  website: string | null;
  phone: string | null;
  source: string;
  source_id: string | null;
  is_headquarters: boolean;
  confidence: number;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('source', {
      type: 'string',
      describe: 'Process only one source: google_maps, datasf, usearch',
    })
    .parse();

  const db = getDb();
  initSchema(db);

  const sourceFilter = argv.source as string | undefined;

  console.log('Starting process pipeline...');

  db.exec(`
    DELETE FROM company_attributes;
    DELETE FROM company_addresses;
    DELETE FROM companies;
    DELETE FROM addresses;
  `);

  const pending: PendingCompany[] = [];

  if (!sourceFilter || sourceFilter === 'google_maps') {
    const gmRows = db
      .prepare('SELECT * FROM staging_google_maps')
      .all() as Array<Record<string, unknown>>;

    console.log(`Processing ${gmRows.length} Google Maps entries...`);

    for (const row of gmRows) {
      const fullAddr = row.address as string | null;
      const parsed = fullAddr ? parseFullAddress(fullAddr) : null;

      pending.push({
        name: row.name as string,
        address: parsed?.street || fullAddr,
        city: parsed?.city || '',
        state: parsed?.state || '',
        zip: parsed?.zip || '',
        lat: row.lat as number | null,
        lng: row.lng as number | null,
        category: row.category as string | null,
        website: row.website as string | null,
        phone: row.phone as string | null,
        source: 'google_maps',
        source_id: row.place_id as string,
        is_headquarters: false,
        confidence: 0.7,
      });
    }
  }

  if (!sourceFilter || sourceFilter === 'datasf') {
    const dsfRows = db
      .prepare('SELECT * FROM staging_datasf')
      .all() as Array<Record<string, unknown>>;

    console.log(`Processing ${dsfRows.length} DataSF entries...`);

    for (const row of dsfRows) {
      pending.push({
        name: row.business_name as string,
        address: row.address as string | null,
        city: (row.city as string) || 'San Francisco',
        state: (row.state as string) || 'CA',
        zip: (row.zip as string) || '',
        lat: null,
        lng: null,
        category: row.naics_desc as string | null,
        website: null,
        phone: null,
        source: 'datasf',
        source_id: row.datasf_id as string,
        is_headquarters: false,
        confidence: 0.8,
      });
    }
  }

  if (!sourceFilter || sourceFilter === 'usearch') {
    const usRows = db
      .prepare('SELECT * FROM staging_usearch')
      .all() as Array<Record<string, unknown>>;

    console.log(`Processing ${usRows.length} Usearch entries...`);

    for (const row of usRows) {
      pending.push({
        name: row.company_name as string,
        address: row.address as string | null,
        city: (row.city as string) || '',
        state: (row.state as string) || '',
        zip: (row.zip as string) || '',
        lat: null,
        lng: null,
        category: row.industry as string | null,
        website: row.website as string | null,
        phone: null,
        source: 'usearch',
        source_id: row.usearch_id as string | null,
        is_headquarters: true,
        confidence: 0.6,
      });
    }
  }

  console.log(`Total pending: ${pending.length} records`);

  // --- Geocode records missing coordinates ---

  const needGeocode = pending.filter(
    (p) => p.lat === null && p.address && p.city && p.state,
  );

  if (needGeocode.length > 0) {
    console.log(`Geocoding ${needGeocode.length} addresses via Census batch geocoder...`);

    const batchInput = needGeocode.map((p, i) => ({
      id: String(i),
      address: p.address!,
      city: p.city,
      state: p.state,
      zip: p.zip,
    }));

    const geocoded = await batchGeocodeCensus(batchInput);

    for (const [idStr, point] of geocoded) {
      const idx = parseInt(idStr);
      const original = needGeocode[idx];
      original.lat = point.lat;
      original.lng = point.lng;
    }

    console.log(`  Geocoded ${geocoded.size}/${needGeocode.length} addresses`);

    const stillMissing = needGeocode.filter((p) => p.lat === null);
    if (stillMissing.length > 0) {
      console.log(
        `  Falling back to Nominatim for ${Math.min(stillMissing.length, 50)} remaining...`,
      );
      for (const p of stillMissing.slice(0, 50)) {
        const query = [p.address, p.city, p.state, p.zip]
          .filter(Boolean)
          .join(', ');
        const point = await geocodeNominatim(query);
        if (point) {
          p.lat = point.lat;
          p.lng = point.lng;
        }
        await new Promise((r) => setTimeout(r, 1100));
      }
    }
  }

  // --- Deduplicate and merge ---

  interface MergedCompany {
    name: string;
    aliases: string[];
    category: string | null;
    website: string | null;
    sources: Array<{ source: string; source_id: string | null }>;
    bestConfidence: number;
    addresses: Array<{
      address: string;
      city: string;
      state: string;
      zip: string;
      lat: number;
      lng: number;
      source: string;
      source_id: string | null;
      phone: string | null;
      is_headquarters: boolean;
      confidence: number;
    }>;
  }

  const merged: MergedCompany[] = [];

  const withCoords = pending.filter((p) => p.lat !== null && p.lng !== null);
  const skipped = pending.length - withCoords.length;
  if (skipped > 0) {
    console.log(`Skipping ${skipped} records without coordinates`);
  }

  console.log(`Deduplicating ${withCoords.length} records...`);

  for (const p of withCoords) {
    let bestMatch: MergedCompany | null = null;
    let bestScore = 0;

    for (const m of merged) {
      const nSim = nameSimilarity(p.name, m.name);

      if (p.website && m.website) {
        const wA = p.website
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '')
          .toLowerCase();
        const wB = m.website
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '')
          .toLowerCase();
        if (wA === wB) {
          bestMatch = m;
          bestScore = 1;
          break;
        }
      }

      if (nSim >= 0.6) {
        for (const addr of m.addresses) {
          if (p.address && addressSimilarity(p.address, addr.address) >= 0.5) {
            const score = nSim * 0.6 + 0.4;
            if (score > bestScore) {
              bestScore = score;
              bestMatch = m;
            }
          }
        }

        if (nSim >= 0.85 && bestScore < nSim) {
          bestScore = nSim;
          bestMatch = m;
        }
      }
    }

    if (bestMatch && bestScore >= 0.6) {
      if (normalizeName(p.name) !== normalizeName(bestMatch.name)) {
        bestMatch.aliases.push(p.name);
      }
      bestMatch.sources.push({ source: p.source, source_id: p.source_id });
      if (!bestMatch.website && p.website) bestMatch.website = p.website;
      if (!bestMatch.category && p.category) bestMatch.category = p.category;
      bestMatch.bestConfidence = Math.max(bestMatch.bestConfidence, p.confidence);

      const existingAddr = bestMatch.addresses.find(
        (a) => p.address && addressSimilarity(p.address, a.address) >= 0.7,
      );
      if (!existingAddr && p.address) {
        bestMatch.addresses.push({
          address: p.address,
          city: p.city,
          state: p.state,
          zip: p.zip,
          lat: p.lat!,
          lng: p.lng!,
          source: p.source,
          source_id: p.source_id,
          phone: p.phone,
          is_headquarters: p.is_headquarters,
          confidence: p.confidence,
        });
      }
    } else {
      merged.push({
        name: p.name,
        aliases: [],
        category: p.category,
        website: p.website,
        sources: [{ source: p.source, source_id: p.source_id }],
        bestConfidence: p.confidence,
        addresses: p.address
          ? [
              {
                address: p.address,
                city: p.city,
                state: p.state,
                zip: p.zip,
                lat: p.lat!,
                lng: p.lng!,
                source: p.source,
                source_id: p.source_id,
                phone: p.phone,
                is_headquarters: p.is_headquarters,
                confidence: p.confidence,
              },
            ]
          : [],
      });
    }
  }

  console.log(`Merged into ${merged.length} unique companies`);

  // --- Cross-reference Google Maps against DataSF ---

  if (!sourceFilter || !sourceFilter) {
    const gmCompanies = merged.filter((m) =>
      m.sources.some((s) => s.source === 'google_maps'),
    );
    const dsfOnly = merged.filter(
      (m) =>
        m.sources.every((s) => s.source === 'datasf') &&
        !m.sources.some((s) => s.source === 'google_maps'),
    );

    let crossMatched = 0;
    for (const gm of gmCompanies) {
      const hasDsf = gm.sources.some((s) => s.source === 'datasf');
      if (hasDsf) {
        gm.bestConfidence = Math.min(gm.bestConfidence + 0.15, 1.0);
        crossMatched++;
      }
    }
    if (crossMatched > 0) {
      console.log(
        `Cross-referenced: ${crossMatched} companies confirmed by DataSF`,
      );
    }
  }

  // --- Write to production tables ---

  console.log('Writing to production tables...');

  const insertAddress = db.prepare(`
    INSERT INTO addresses (address1, address2, aliases, city, state, zip, country, lat, lng, source, source_id, crawled_at)
    VALUES (@address1, @address2, @aliases, @city, @state, @zip, 'US', @lat, @lng, @source, @source_id, @crawled_at)
  `);

  const insertCompany = db.prepare(`
    INSERT INTO companies (canonical_name, aliases, category, website, source, source_id, crawled_at)
    VALUES (@canonical_name, @aliases, @category, @website, @source, @source_id, @crawled_at)
  `);

  const insertCompanyAddress = db.prepare(`
    INSERT INTO company_addresses (company_id, address_id, is_headquarters, phone, source, confidence, crawled_at)
    VALUES (@company_id, @address_id, @is_headquarters, @phone, @source, @confidence, @crawled_at)
  `);

  const crawledAt = new Date().toISOString();

  const writeAll = db.transaction(() => {
    for (const m of merged) {
      const primarySource = m.sources[0];
      const companyResult = insertCompany.run({
        canonical_name: m.name,
        aliases: m.aliases.length > 0 ? JSON.stringify(m.aliases) : null,
        category: m.category,
        website: m.website,
        source: primarySource.source,
        source_id: primarySource.source_id,
        crawled_at: crawledAt,
      });
      const companyId = companyResult.lastInsertRowid;

      for (const addr of m.addresses) {
        const parsed = parseFullAddress(
          [addr.address, addr.city, addr.state, addr.zip]
            .filter(Boolean)
            .join(', '),
        );

        const addrResult = insertAddress.run({
          address1: parsed.street || addr.address,
          address2: parsed.unit || null,
          aliases: null,
          city: addr.city || parsed.city,
          state: addr.state || parsed.state,
          zip: addr.zip || parsed.zip,
          lat: addr.lat,
          lng: addr.lng,
          source: addr.source,
          source_id: addr.source_id,
          crawled_at: crawledAt,
        });

        insertCompanyAddress.run({
          company_id: companyId,
          address_id: addrResult.lastInsertRowid,
          is_headquarters: addr.is_headquarters ? 1 : 0,
          phone: addr.phone,
          source: addr.source,
          confidence: Math.min(addr.confidence + (m.sources.length > 1 ? 0.1 : 0), 1.0),
          crawled_at: crawledAt,
        });
      }
    }
  });

  writeAll();

  // --- Apply enrichment ---

  const enrichRows = db
    .prepare('SELECT * FROM staging_enrichment')
    .all() as Array<Record<string, unknown>>;

  if (enrichRows.length > 0) {
    console.log(`Applying ${enrichRows.length} enrichment attributes...`);

    const insertAttr = db.prepare(`
      INSERT INTO company_attributes (company_id, attribute_type, attribute_value, source, source_url, confidence, evidence, crawled_at)
      VALUES (@company_id, @attribute_type, @attribute_value, @source, @source_url, @confidence, @evidence, @crawled_at)
    `);

    const applyEnrichment = db.transaction(() => {
      for (const e of enrichRows) {
        const sourceTable = e.source_table as string;
        const sourceRowId = e.source_row_id as number;

        let companyName: string | null = null;
        if (sourceTable === 'staging_google_maps') {
          const row = db
            .prepare('SELECT name FROM staging_google_maps WHERE id = ?')
            .get(sourceRowId) as { name: string } | undefined;
          companyName = row?.name || null;
        } else if (sourceTable === 'staging_usearch') {
          const row = db
            .prepare('SELECT company_name FROM staging_usearch WHERE id = ?')
            .get(sourceRowId) as { company_name: string } | undefined;
          companyName = row?.company_name || null;
        } else if (sourceTable === 'staging_datasf') {
          const row = db
            .prepare('SELECT business_name FROM staging_datasf WHERE id = ?')
            .get(sourceRowId) as { business_name: string } | undefined;
          companyName = row?.business_name || null;
        }

        if (!companyName) continue;

        const company = db
          .prepare('SELECT id FROM companies WHERE canonical_name = ?')
          .get(companyName) as { id: number } | undefined;

        if (!company) {
          const normalized = normalizeName(companyName);
          const allCompanies = db
            .prepare('SELECT id, canonical_name FROM companies')
            .all() as Array<{ id: number; canonical_name: string }>;

          const match = allCompanies.find(
            (c) => nameSimilarity(c.canonical_name, companyName!) >= 0.7,
          );
          if (!match) continue;

          insertAttr.run({
            company_id: match.id,
            attribute_type: e.attribute_type,
            attribute_value: e.attribute_value,
            source: e.source,
            source_url: e.source_url || null,
            confidence: 0.6,
            evidence: e.evidence || null,
            crawled_at: e.crawled_at,
          });
        } else {
          insertAttr.run({
            company_id: company.id,
            attribute_type: e.attribute_type,
            attribute_value: e.attribute_value,
            source: e.source,
            source_url: e.source_url || null,
            confidence: 0.7,
            evidence: e.evidence || null,
            crawled_at: e.crawled_at,
          });
        }
      }
    });

    applyEnrichment();
  }

  // --- Attach Usearch revenue/employee_count from staging ---

  if (!sourceFilter || sourceFilter === 'usearch') {
    const usRows = db
      .prepare(
        'SELECT company_name, revenue, employee_count FROM staging_usearch WHERE revenue IS NOT NULL OR employee_count IS NOT NULL',
      )
      .all() as Array<{
      company_name: string;
      revenue: string | null;
      employee_count: string | null;
    }>;

    if (usRows.length > 0) {
      console.log(
        `Attaching ${usRows.length} Usearch revenue/employee attributes...`,
      );

      const insertAttr = db.prepare(`
        INSERT INTO company_attributes (company_id, attribute_type, attribute_value, source, source_url, confidence, evidence, crawled_at)
        VALUES (@company_id, @attribute_type, @attribute_value, 'usearch', NULL, 0.5, 'Usearch dataset', @crawled_at)
      `);

      const attachUsearch = db.transaction(() => {
        for (const row of usRows) {
          const company = db
            .prepare('SELECT id FROM companies WHERE canonical_name = ?')
            .get(row.company_name) as { id: number } | undefined;

          const companyId =
            company?.id ??
            (
              db
                .prepare('SELECT id, canonical_name FROM companies')
                .all() as Array<{ id: number; canonical_name: string }>
            ).find(
              (c) => nameSimilarity(c.canonical_name, row.company_name) >= 0.7,
            )?.id;

          if (!companyId) continue;

          if (row.revenue) {
            insertAttr.run({
              company_id: companyId,
              attribute_type: 'revenue',
              attribute_value: row.revenue,
              crawled_at: crawledAt,
            });
          }

          if (row.employee_count) {
            insertAttr.run({
              company_id: companyId,
              attribute_type: 'employee_count',
              attribute_value: row.employee_count,
              crawled_at: crawledAt,
            });
          }
        }
      });

      attachUsearch();
    }
  }

  const companyCount = (
    db.prepare('SELECT COUNT(*) as c FROM companies').get() as { c: number }
  ).c;
  const addressCount = (
    db.prepare('SELECT COUNT(*) as c FROM addresses').get() as { c: number }
  ).c;
  const attrCount = (
    db.prepare('SELECT COUNT(*) as c FROM company_attributes').get() as {
      c: number;
    }
  ).c;

  console.log(`Done. Production tables:`);
  console.log(`  ${companyCount} companies`);
  console.log(`  ${addressCount} addresses`);
  console.log(`  ${attrCount} attributes`);

  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
