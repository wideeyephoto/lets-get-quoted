// One-time backfill: geocode existing scheduled jobs' addresses (the route-density
// anchors) and each account's mailing address (the service-area center), so
// instant-booking route-density has coordinates to work with. Idempotent —
// stamps geocoded_at so a re-run only picks up records not yet attempted.
// Precise-only (rooftop / interpolated); a coarse centroid is skipped so it can't
// fake proximity. Gentle rate limit. Needs DATABASE_URL + GOOGLE_MAPS_API_KEY.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnvFile() {
  for (const fileName of ['.env.local', '.env']) {
    try {
      const contents = await readFile(resolve(__dirname, '..', fileName), 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const i = trimmed.indexOf('=');
        if (i === -1) continue;
        const key = trimmed.slice(0, i).trim();
        const value = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) process.env[key] = value;
      }
    } catch {
      // ignore missing files
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(address, key) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 'OK') return null;
  const geometry = data.results?.[0]?.geometry;
  const loc = geometry?.location;
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null;
  const precise = geometry?.location_type === 'ROOFTOP' || geometry?.location_type === 'RANGE_INTERPOLATED';
  return { lat: loc.lat, lng: loc.lng, precise };
}

async function main() {
  await loadEnvFile();
  const connectionString = process.env.DATABASE_URL;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  if (!key) {
    console.error('GOOGLE_MAPS_API_KEY is not set — add the server geocoding key first.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows: jobs } = await client.query(
      `select id, address from jobs
       where scheduled_for is not null and status <> 'archived'
         and address is not null and btrim(address) <> '' and geocoded_at is null
       limit 2000`,
    );
    let jHit = 0;
    let jMiss = 0;
    for (const job of jobs) {
      const g = await geocode(job.address, key);
      const at = new Date().toISOString();
      if (g?.precise) {
        await client.query('update jobs set lat=$1, lng=$2, geocoded_at=$3 where id=$4', [g.lat, g.lng, at, job.id]);
        jHit++;
      } else {
        await client.query('update jobs set geocoded_at=$1 where id=$2', [at, job.id]);
        jMiss++;
      }
      await sleep(120);
    }
    console.log(`Jobs: ${jHit} geocoded, ${jMiss} imprecise/failed (of ${jobs.length} attempted).`);

    const { rows: accounts } = await client.query(
      `select id, mailing_address from accounts
       where mailing_address is not null and btrim(mailing_address) <> '' and service_center_lat is null
       limit 2000`,
    );
    let aHit = 0;
    for (const acc of accounts) {
      const g = await geocode(acc.mailing_address, key);
      if (g?.precise) {
        await client.query('update accounts set service_center_lat=$1, service_center_lng=$2 where id=$3', [g.lat, g.lng, acc.id]);
        aHit++;
      }
      await sleep(120);
    }
    console.log(`Accounts: ${aHit} service centers geocoded (of ${accounts.length} attempted).`);
    console.log('Backfill complete.');
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
