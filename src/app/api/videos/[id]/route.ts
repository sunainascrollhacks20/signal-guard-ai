import { errorResponse, successResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getSession, serializeSession } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    const { id } = await context.params;
    const session = await getSession(Number(id));
    if (!session || session.userId !== user.id) return errorResponse('NOT_FOUND', 'Video session not found', 404);
    return successResponse({ session: serializeSession(session) });
  } catch (error) {
    console.error('Video session error:', error);
    return errorResponse('SERVER_ERROR', 'Unable to load video session', 500);
  }
}
