import { errorResponse, successResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getStore, serializeSession, updateStore } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);

    const store = await getStore();
    const session = store.sessions.find((item) => item.id === store.activeSessionIds[user.id] && item.userId === user.id);
    if (!session) return errorResponse('NO_SESSION', 'Process a video before starting the demo emergency scenario', 400);
    const track = session.tracks.find((item) => item.id === session.selectedTrackId);
    if (!track) return errorResponse('NO_TRACK', 'The current video has no track to use for the demo scenario', 400);
    if (session.emergencyType === 'NONE') return errorResponse('NORMAL_TRAFFIC', 'Normal traffic videos do not request signal priority', 400);

    const existingCandidate = session.candidates.find((candidate) => candidate.isDemo && candidate.trackId === track.id);
    const updated = await updateStore((current) => {
      const currentSession = current.sessions.find((item) => item.id === session.id);
      if (!currentSession) return null;
      const candidate = existingCandidate ?? {
        id: currentSession.candidates.length + 1,
        trackId: track.id,
        frameNumber: track.lastFrame,
        visualScore: 0.92,
        behaviouralScore: 0.88,
        temporalScore: 0.9,
        contextScore: 0.84,
        overallConfidence: 0.89,
        status: 'VERIFIED' as const,
        decision: `${session.emergencyType === 'AMBULANCE' ? 'Ambulance' : 'Fire brigade'} scenario verified for Digital Twin simulation`,
        reason: `VIDEO-DERIVED EMERGENCY SIMULATION only. Reuses the selected measured track as a ${session.emergencyType === 'AMBULANCE' ? 'ambulance' : 'fire brigade'} demo subject; it is not a real-world vehicle classification.`,
        createdAt: new Date().toISOString(),
        isDemo: true,
      };
      if (!existingCandidate) currentSession.candidates.push(candidate);
      const priority = currentSession.priorityEvents.find((event) => event.isDemo) ?? {
        id: currentSession.priorityEvents.length + 1,
        candidateId: candidate.id,
        trackId: candidate.trackId,
        recommendedAction: 'PRIORITY' as const,
        confidence: candidate.overallConfidence,
        safetyStatus: 'SAFE' as const,
        estimatedTimeSaved: 18,
        queueImpact: 3,
        reason: 'DEMO / SIMULATION recommendation: verified demo event clears the approach after a safe phase transition.',
        createdAt: new Date().toISOString(),
        isDemo: true,
      };
      if (!currentSession.priorityEvents.some((event) => event.isDemo && event.trackId === track.id)) currentSession.priorityEvents.push(priority);
      currentSession.demoScenario = true;
      currentSession.simulationActive = false;
      currentSession.simulationState = 'NORMAL';
      currentSession.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'VIDEO-DERIVED EMERGENCY SIMULATION', trackId: track.id, details: 'Selected tracked vehicle used as the emergency-response subject for simulation' });
      currentSession.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'VERIFICATION COMPLETED', trackId: track.id, details: 'Simulation evidence accepted for recommendation demonstration' });
      currentSession.decisionEvents.push({ timestamp: new Date().toISOString(), event: 'PRIORITY RECOMMENDED', trackId: track.id, details: 'Safe deterministic priority recommendation generated' });
      return currentSession;
    });

    return updated ? successResponse({ session: serializeSession(updated), demo: true }) : errorResponse('NOT_FOUND', 'Processing session not found', 404);
  } catch (error) {
    console.error('Demo scenario error:', error);
    return errorResponse('SERVER_ERROR', 'Unable to activate demo scenario', 500);
  }
}