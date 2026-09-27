import { successResponse } from '@/lib/api-response';
import { getStore } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = await getStore();
  return successResponse({ status: 'healthy', persistence: 'local-sqlite', sessions: store.sessions.length, timestamp: new Date().toISOString() });
}
