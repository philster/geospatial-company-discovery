import 'dotenv/config';
import { getDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';

interface CompanyRow {
  id: number;
  name: string;
  website: string | null;
  source_table: string;
}

async function scrapeWebsiteMetadata(
  url: string,
): Promise<Array<{ type: string; value: string; evidence: string }>> {
  const attrs: Array<{ type: string; value: string; evidence: string }> = [];

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'geospatial-company-discovery/0.1 (personal tool)' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });

    if (!res.ok) return attrs;
    const html = await res.text();

    const descMatch = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    );
    if (descMatch) {
      attrs.push({
        type: 'description',
        value: descMatch[1].slice(0, 500),
        evidence: `<meta name="description"> from ${url}`,
      });
    }

    const employeePatterns = [
      /(\d[\d,]+)\s*(?:\+\s*)?employees/i,
      /team\s*(?:of\s*)?(\d[\d,]+)/i,
      /(\d[\d,]+)\s*(?:\+\s*)?team\s*members/i,
    ];

    for (const pattern of employeePatterns) {
      const match = html.match(pattern);
      if (match) {
        attrs.push({
          type: 'employee_count',
          value: match[1].replace(/,/g, ''),
          evidence: `Pattern match on ${url}: "${match[0]}"`,
        });
        break;
      }
    }
  } catch {
    // Timeout or network error — skip
  }

  return attrs;
}

async function queryEdgar(
  companyName: string,
): Promise<Array<{ type: string; value: string; evidence: string; source_url: string }>> {
  const attrs: Array<{
    type: string;
    value: string;
    evidence: string;
    source_url: string;
  }> = [];

  try {
    const searchUrl = new URL('https://efts.sec.gov/LATEST/search-index');
    searchUrl.searchParams.set('q', `"${companyName}"`);
    searchUrl.searchParams.set('dateRange', 'custom');
    searchUrl.searchParams.set('startdt', '2024-01-01');
    searchUrl.searchParams.set('forms', '10-K,10-Q');

    const fullTextUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&forms=10-K`;

    const companySearchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22&dateRange=custom&startdt=2024-01-01&forms=10-K,10-Q`;

    const edgarCompanyUrl = `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(companyName)}&CIK=&type=10-K&dateb=&owner=include&count=5&search_text=&action=getcompany`;

    const res = await fetch(edgarCompanyUrl, {
      headers: { 'User-Agent': 'geospatial-company-discovery cyber_peewee@yahoo.com' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return attrs;
    const html = await res.text();

    const cikMatch = html.match(/CIK=(\d+)/);
    if (!cikMatch) return attrs;

    const cik = cikMatch[1].padStart(10, '0');
    const factUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;

    const factRes = await fetch(factUrl, {
      headers: { 'User-Agent': 'geospatial-company-discovery cyber_peewee@yahoo.com' },
      signal: AbortSignal.timeout(10000),
    });

    if (!factRes.ok) return attrs;
    const facts = (await factRes.json()) as {
      facts?: {
        'dei'?: Record<string, { units?: Record<string, Array<{ val: number; end: string }>> }>;
        'us-gaap'?: Record<string, { units?: Record<string, Array<{ val: number; end: string }>> }>;
      };
    };

    const employeeData =
      facts.facts?.['dei']?.['EntityCommonStockSharesOutstanding'] ??
      facts.facts?.['dei']?.['EntityNumberOfEmployees'];
    if (employeeData?.units) {
      const units = Object.values(employeeData.units)[0];
      if (units && units.length > 0) {
        const latest = units[units.length - 1];
        attrs.push({
          type: 'employee_count',
          value: String(latest.val),
          evidence: `SEC EDGAR filing, period ending ${latest.end}`,
          source_url: factUrl,
        });
      }
    }

    const revenueData = facts.facts?.['us-gaap']?.['Revenues'] ??
      facts.facts?.['us-gaap']?.['RevenueFromContractWithCustomerExcludingAssessedTax'];
    if (revenueData?.units) {
      const usdUnits = revenueData.units['USD'];
      if (usdUnits && usdUnits.length > 0) {
        const latest = usdUnits[usdUnits.length - 1];
        attrs.push({
          type: 'revenue',
          value: String(latest.val),
          evidence: `SEC EDGAR filing, period ending ${latest.end}`,
          source_url: factUrl,
        });
      }
    }
  } catch {
    // SEC EDGAR timeout or error — skip
  }

  return attrs;
}

async function main() {
  const db = getDb();
  initSchema(db);

  const companies: CompanyRow[] = [];

  const gmRows = db
    .prepare('SELECT id, name, website FROM staging_google_maps')
    .all() as Array<{ id: number; name: string; website: string | null }>;
  for (const r of gmRows) {
    companies.push({ ...r, source_table: 'staging_google_maps' });
  }

  const usRows = db
    .prepare('SELECT id, company_name as name, website FROM staging_usearch')
    .all() as Array<{ id: number; name: string; website: string | null }>;
  for (const r of usRows) {
    companies.push({ ...r, source_table: 'staging_usearch' });
  }

  const dsfRows = db
    .prepare('SELECT id, business_name as name, NULL as website FROM staging_datasf')
    .all() as Array<{ id: number; name: string; website: string | null }>;
  for (const r of dsfRows) {
    companies.push({ ...r, source_table: 'staging_datasf' });
  }

  console.log(`Enriching ${companies.length} companies...`);

  const insert = db.prepare(`
    INSERT INTO staging_enrichment (source_table, source_row_id, attribute_type, attribute_value, source, source_url, evidence, crawled_at)
    VALUES (@source_table, @source_row_id, @attribute_type, @attribute_value, @source, @source_url, @evidence, @crawled_at)
  `);

  const crawledAt = new Date().toISOString();
  let enriched = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    if (i > 0 && i % 50 === 0) {
      console.log(`  Progress: ${i}/${companies.length}`);
    }

    if (company.website) {
      const webAttrs = await scrapeWebsiteMetadata(company.website);
      for (const attr of webAttrs) {
        insert.run({
          source_table: company.source_table,
          source_row_id: company.id,
          attribute_type: attr.type,
          attribute_value: attr.value,
          source: 'company_website',
          source_url: company.website,
          evidence: attr.evidence,
          crawled_at: crawledAt,
        });
        enriched++;
      }
    }

    const edgarAttrs = await queryEdgar(company.name);
    for (const attr of edgarAttrs) {
      insert.run({
        source_table: company.source_table,
        source_row_id: company.id,
        attribute_type: attr.type,
        attribute_value: attr.value,
        source: 'sec_edgar',
        source_url: attr.source_url,
        evidence: attr.evidence,
        crawled_at: crawledAt,
      });
      enriched++;
    }

    // Rate limit: ~1 req/sec for website scraping
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`Added ${enriched} enrichment attributes`);
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
