// Applies SQL migrations in ./drizzle, then seeds the demo data if the database is empty.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { seedAll } from '../src/lib/seed-core.mjs';
import nextEnv from '@next/env';

// Load .env / .env.local the same way Next.js does (Docker passes real env vars, which win).
nextEnv.loadEnvConfig(new URL('..', import.meta.url).pathname);

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
for (let i = 0; i < 30; i++) {
  try { await client.connect(); break; } catch (e) {
    if (i === 29) throw e;
    console.log('[migrate] waiting for database…'); await new Promise((r) => setTimeout(r, 2000));
  }
}
await migrate(drizzle(client), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
console.log('[migrate] schema up to date');
const force = process.argv.includes('--force') || process.env.SEED_FORCE === '1';
console.log('[seed]', await seedAll(client, { force }));
await client.end();
