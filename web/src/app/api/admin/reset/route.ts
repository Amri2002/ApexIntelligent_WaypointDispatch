import { handler, requireRole } from '@/lib/auth';
import { pool } from '@/db';
import { seedAll } from '@/lib/seed-core.mjs';

/** Restores the demo day (orders, users, empty plans) so a judge can run the walkthrough again. */
export const POST = handler(async () => {
  await requireRole('DISPATCHER');
  const client = await pool.connect();
  try { return { result: await seedAll(client, { force: true }) }; } finally { client.release(); }
});
