import { errorResponse, successResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getStore, serializeSession, updateStore } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    const body = await request.json();
    const trackId = Number(body?.trackId);
    if (!Number.isInteger(trackId) || trackId < 1) return errorResponse('VALIDATION_ERROR', 'A valid track ID is required', 400);
    const result = await updateStore((store) => {
      const sessionId = store.activeSessionIds[user.id];
      const session = store.sessions.find((item) => item.id === sessionId && item.userId === user.id);
      if (!session) return { error: 'NO_SESSION' as const };
      if (!session.tracks.some((track) => track.id === trackId)) return { error: 'NO_TRACK' as const };
      session.selectedTrackId = trackId;
      session.simulationActive = false;
      session.demoScenario = false;
      session.candidates = session.candidates.filter((candidate) => !candidate.isDemo);
      session.priorityEvents = session.priorityEvents.filter((event) => !event.isDemo);
      session.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'TRACK SELECTED', trackId, details: `Track ${trackId} selected from current video session` });
      return { session };
    });
    if ('error' in result && result.error) return errorResponse(result.error, result.error === 'NO_SESSION' ? 'No active processing session' : 'Track does not belong to the active session', 400);
    return successResponse({ session: serializeSession(result.session) });
  } catch (error) {
    console.error('Track selection error:', error);
    return errorResponse('SERVER_ERROR', 'Unable to select track', 500);
  }
}
