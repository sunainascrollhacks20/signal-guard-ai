import { errorResponse, successResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getStore, serializeSession, updateStore } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

type SimulationAction = 'start' | 'advance' | 'pause' | 'replay' | 'reset';

const transitions: Record<string, 'REQUESTED' | 'ACTIVE' | 'PASSING' | 'RESTORED' | 'COMPLETED'> = {
  NORMAL: 'REQUESTED',
  REQUESTED: 'ACTIVE',
  ACTIVE: 'PASSING',
  PASSING: 'RESTORED',
  RESTORED: 'COMPLETED',
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    const body = await request.json().catch(() => ({}));
    const action = body.action as SimulationAction;
    const result = await updateStore((store) => {
      const session = store.sessions.find((item) => item.id === store.activeSessionIds[user.id] && item.userId === user.id);
      if (!session) return { error: 'NO_SESSION' as const };
      if (!session.selectedTrackId) return { error: 'NO_TRACK' as const };
      const now = new Date().toISOString();
      const state = session.simulationState ?? 'NORMAL';
      if (action === 'reset') {
        session.simulationActive = false;
        session.simulationState = 'NORMAL';
        session.simulationCompletedAt = undefined;
        session.decisionEvents.push({ timestamp: now, event: 'SIMULATION RESET', trackId: session.selectedTrackId, details: 'Digital Twin returned to normal traffic' });
      } else if (action === 'pause') {
        session.simulationActive = false;
        session.decisionEvents.push({ timestamp: now, event: 'SIMULATION PAUSED', trackId: session.selectedTrackId, details: `Paused in ${state} state` });
      } else if (action === 'replay') {
        session.simulationActive = true;
        session.simulationState = 'REQUESTED';
        session.simulationStartedAt = now;
        session.simulationCompletedAt = undefined;
        session.decisionEvents.push({ timestamp: now, event: 'SIMULATION STARTED', trackId: session.selectedTrackId, details: 'Video-derived trajectory replay restarted' });
        session.decisionEvents.push({ timestamp: now, event: 'PRIORITY REQUESTED', trackId: session.selectedTrackId, details: 'Signal priority request generated' });
      } else if (action === 'start') {
        if (state === 'COMPLETED') return { session };
        if (state !== 'NORMAL' && !session.simulationActive) {
          session.simulationActive = true;
          session.decisionEvents.push({ timestamp: now, event: 'SIMULATION RESUMED', trackId: session.selectedTrackId, details: `Simulation resumed in ${state} state` });
          return { session };
        }
        session.simulationActive = true;
        session.simulationStartedAt = session.simulationStartedAt ?? now;
        if (state === 'NORMAL') session.decisionEvents.push({ timestamp: now, event: 'SIMULATION STARTED', trackId: session.selectedTrackId, details: 'Video-derived emergency simulation started' });
        const next = transitions[state];
        session.simulationState = next;
        if (next === 'REQUESTED') session.decisionEvents.push({ timestamp: now, event: 'PRIORITY REQUESTED', trackId: session.selectedTrackId, details: 'Signal priority recommendation requested' });
      } else if (action === 'advance') {
        const next = transitions[state];
        if (next) {
          session.simulationActive = next !== 'COMPLETED';
          session.simulationState = next;
          const event = next === 'ACTIVE' ? 'PRIORITY ACTIVE' : next === 'PASSING' ? 'EMERGENCY VEHICLE PASSING' : next === 'RESTORED' ? 'NORMAL SIGNAL RESTORED' : next === 'COMPLETED' ? 'SIMULATION COMPLETED' : 'PRIORITY REQUESTED';
          session.decisionEvents.push({ timestamp: now, event, trackId: session.selectedTrackId, details: next === 'ACTIVE' ? 'Green priority phase activated' : next === 'PASSING' ? 'Selected track passing through simulated intersection' : next === 'RESTORED' ? 'Normal signal cycle restored' : next === 'COMPLETED' ? 'Digital Twin simulation completed successfully' : 'Signal priority requested' });
          if (next === 'COMPLETED') {
            session.simulationCompletedAt = now;
            const priority = session.priorityEvents.find((item) => item.trackId === session.selectedTrackId);
            session.decisionEvents.push({ timestamp: now, event: 'IMPACT MEASURED', trackId: session.selectedTrackId, details: `Normal delay ${priority ? 24 + priority.queueImpact * 2 : 0}s; priority delay ${priority ? Math.max(2, 24 + priority.queueImpact * 2 - priority.estimatedTimeSaved) : 0}s; estimated time saved ${priority?.estimatedTimeSaved ?? 0}s` });
          }
        }
      } else {
        return { error: 'INVALID_ACTION' as const };
      }
      return { session };
    });
    if ('error' in result && result.error) return errorResponse(result.error, result.error === 'NO_TRACK' ? 'Select a detected track first' : result.error === 'NO_SESSION' ? 'No active processing session' : 'Invalid simulation action', 400);
    return successResponse({ session: serializeSession(result.session) });
  } catch (error) {
    console.error('Simulation error:', error);
    return errorResponse('SERVER_ERROR', 'Unable to update simulation', 500);
  }
}