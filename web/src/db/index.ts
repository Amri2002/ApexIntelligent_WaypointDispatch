import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const g = globalThis as unknown as { __wpPool?: Pool };
export const pool = g.__wpPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') g.__wpPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
