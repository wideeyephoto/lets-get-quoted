import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnvFile() {
  const candidates = ['.env.local', '.env'];

  for (const fileName of candidates) {
    try {
      const filePath = resolve(__dirname, '..', fileName);
      const contents = await readFile(filePath, 'utf8');

      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, '');

        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch {
      // Ignore missing files and continue to the next candidate.
    }
  }
}

async function main() {
  await loadEnvFile();

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('DATABASE_URL is not set. Export your Supabase Postgres connection string and try again.');
    process.exit(1);
  }

  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('create schema if not exists public');
    await client.query(schema);
    console.log('Schema deployed successfully.');
  } catch (error) {
    console.error('Schema deployment failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
