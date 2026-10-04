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

// A pg.Client cannot be reused after a failed connect, so each attempt gets a fresh one.
let client;
for (let i = 0; i < 30; i++) {
  client = new pg.Client({ connectionString: url });
  client.on('error', (e) => console.error('[migrate] database connection error:', e.message));
  try { await client.connect(); break; } catch (e) {
    await client.end().catch(() => {});
    if (i === 29) throw e;
    console.log('[migrate] waiting for database…'); await new Promise((r) => setTimeout(r, 2000));
  }
}
await migrate(drizzle(client), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
console.log('[migrate] schema up to date');
const force = process.argv.includes('--force') || process.env.SEED_FORCE === '1';
console.log('[seed]', await seedAll(client, { force }));
await client.end();
