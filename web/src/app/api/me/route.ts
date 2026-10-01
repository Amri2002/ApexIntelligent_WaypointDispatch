import { handler, requireRole } from '@/lib/auth';
export const GET = handler(async () => requireRole());
