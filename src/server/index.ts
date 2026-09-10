import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { geocodeNominatim } from '../shared/geocode.js';
import { queryCompanies } from '../query/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const db = getDb();
initSchema(db);

app.use(express.json());

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

app.get('/api/query', async (req, res) => {
  try {
    let lat: number | undefined;
    let lng: number | undefined;

    if (req.query.lat && req.query.lng) {
      lat = parseFloat(req.query.lat as string);
      lng = parseFloat(req.query.lng as string);
    } else if (req.query.location) {
      const point = await geocodeNominatim(req.query.location as string);
      if (!point) {
        res.status(400).json({ error: `Could not geocode "${req.query.location}"` });
        return;
      }
      lat = point.lat;
      lng = point.lng;
    }

    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'Provide lat+lng or location parameter' });
      return;
    }

    const radiusMiles = parseFloat((req.query.radius_miles as string) || '5');
    if (isNaN(radiusMiles) || radiusMiles <= 0 || radiusMiles > 100) {
      res.status(400).json({ error: 'radius_miles must be between 0 and 100' });
      return;
    }

    const results = queryCompanies(lat, lng, radiusMiles);

    res.json({
      center: { lat, lng },
      radius_miles: radiusMiles,
      count: results.length,
      companies: results,
    });
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats', (_req, res) => {
  const companies = (
    db.prepare('SELECT COUNT(*) as c FROM companies').get() as { c: number }
  ).c;
  const addresses = (
    db.prepare('SELECT COUNT(*) as c FROM addresses').get() as { c: number }
  ).c;
  const attributes = (
    db.prepare('SELECT COUNT(*) as c FROM company_attributes').get() as {
      c: number;
    }
  ).c;

  res.json({ companies, addresses, attributes });
});

app.use((_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  closeDb();
  process.exit(0);
});
