import { successResponse, unauthorizedResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getStore } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorizedResponse();
  const store = await getStore();
  const latest = store.sessions.find((session) => session.userId === user.id);
  return successResponse({ system: 'ONLINE', processing: latest?.status ?? 'READY', persistence: 'LOCAL', activeSession: latest?.id ?? null, timestamp: new Date().toISOString() });
}
