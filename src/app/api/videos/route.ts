import { errorResponse, successResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getStore, serializeSession } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    const store = await getStore();
    return successResponse({ sessions: store.sessions.filter((session) => session.userId === user.id).map(serializeSession) });
  } catch (error) {
    console.error('Video list error:', error);
    return errorResponse('SERVER_ERROR', 'Unable to load video sessions', 500);
  }
}
