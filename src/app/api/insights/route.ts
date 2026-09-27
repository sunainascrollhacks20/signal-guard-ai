import { errorResponse, successResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getStore, serializeSession } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    }

    const store = await getStore();

    // Only use sessions belonging to the currently logged-in user.
    const userSessions = store.sessions.filter(
      (session) => session.userId === user.id
    );

    // Use the currently active processing session.
    const activeId =
      store.activeSessionIds[user.id] ?? userSessions[0]?.id;

    const latest =
      userSessions.find((session) => session.id === activeId) ?? null;

    // No processing session yet.
    if (!latest) {
      return successResponse({
        latestSession: null,
        sessions: [],
        metrics: emptyMetrics(),
        candidates: [],
        priorityEvents: [],
        classDistribution: {},
        detections: [],
        detectionTrend: {},
        confidenceDistribution: {},
        emergencyOutcomes: {},
        priorityOutcomes: {},
        hasDemoData: false,
        decisionLogs: [],
        selectedTrack: null,
      });
    }

    const detections = latest.detections ?? [];
    const candidates = latest.candidates ?? [];
    const priorityEvents = latest.priorityEvents ?? [];
    const tracks = latest.tracks ?? [];
    const decisionEvents = latest.decisionEvents ?? [];

    const verified = candidates.filter(
      (candidate) => candidate.status === 'VERIFIED'
    );

    /*
     * IMPORTANT:
     * Do NOT hide priority events until the Digital Twin is completed.
     *
     * Previously:
     *
     * priorityEvents: simulationHasImpact
     *   ? priorityEvents.length
     *   : 0
     *
     * That made Signal Priority permanently show 0 while the
     * simulation was running or before its final state was persisted.
     *
     * Now the dashboard reports the actual priority events belonging
     * to this processing session.
     */
    const signalPriorityCount = priorityEvents.length;

    const timeSaved = priorityEvents.reduce(
      (sum, event) => sum + (Number(event.estimatedTimeSaved) || 0),
      0
    );

    const classDistribution = countBy(
      detections,
      (detection) => detection.className
    );

    const detectionTrend = countBy(
      detections,
      (detection) => String(detection.frameNumber)
    );

    const confidenceDistribution = countBy(
      detections,
      (detection) =>
        `${Math.floor(detection.confidence * 10) * 10}-${
          Math.floor(detection.confidence * 10) * 10 + 9
        }%`
    );

    const selectedTrack = latest.selectedTrackId
      ? tracks.find((track) => track.id === latest.selectedTrackId) ?? null
      : null;

    const decisionLogs = decisionEvents.map((event) => ({
      timestamp: event.timestamp,
      vehicleId: event.trackId
        ? `TRACK-${event.trackId}`
        : `SESSION-${latest.id}`,
      event: event.event,
      confidence: 0,
      decision: eventState(event.event),
      action: event.details,
      source: eventSource(event.event),
      sessionId: latest.id,
      trackId: event.trackId ?? null,
      isDemo: false,
    }));

    return successResponse({
      latestSession: serializeSession(latest),

      sessions: userSessions.map(serializeSession),

      metrics: {
        vehiclesDetected: detections.length,

        activeTracks: tracks.filter(
          (track) => track.isActive
        ).length,

        emergencyCandidates: candidates.length,

        verifiedEmergencies: verified.length,

        // FIXED: report the actual priority events
        // from the current processing session.
        priorityEvents: signalPriorityCount,

        // FIXED: calculate time saved from the same
        // current-session priority events.
        timeSaved,

        verificationRate: candidates.length
          ? Math.round(
              (verified.length / candidates.length) * 100
            )
          : 0,
      },

      selectedTrack,

      candidates,

      // Only events from the current session are returned.
      priorityEvents,

      classDistribution,

      detections,

      detectionTrend,

      confidenceDistribution,

      emergencyOutcomes: countBy(
        candidates,
        (candidate) => candidate.status
      ),

      priorityOutcomes: countBy(
        priorityEvents,
        (event) => event.recommendedAction
      ),

      hasDemoData: latest.demoScenario ?? false,

      decisionLogs,
    });
  } catch (error) {
    console.error('Insights error:', error);

    return errorResponse(
      'SERVER_ERROR',
      'Unable to load processing insights',
      500
    );
  }
}

function eventState(event: string) {
  if (event.includes('REQUESTED')) return 'REQUESTED';
  if (event.includes('ACTIVE')) return 'ACTIVE';
  if (event.includes('RESET')) return 'READY';
  if (event.includes('PAUSED')) return 'PAUSED';
  if (event.includes('VERIFICATION')) return 'SIMULATION';

  if (event.includes('SIMULATION')) {
    return event.includes('COMPLETED')
      ? 'COMPLETED'
      : 'ACTIVE';
  }

  if (event.includes('RESTORED')) return 'RESTORED';

  return 'COMPLETED';
}

function eventSource(event: string) {
  if (event.includes('PRIORITY')) return 'SIGNAL PRIORITY';

  if (
    event.includes('SIMULATION') ||
    event.includes('DIGITAL') ||
    event.includes('PASSING') ||
    event.includes('RESTORED')
  ) {
    return 'DIGITAL TWIN';
  }

  if (event.includes('TRACK')) return 'TRACKING';

  if (event.includes('VERIFICATION')) return 'VERIFICATION';

  if (event.includes('REPORT')) return 'REPORTING';

  return 'VIDEO PIPELINE';
}

function countBy<T>(
  items: T[],
  key: (item: T) => string
): Record<string, number> {
  return items.reduce<Record<string, number>>(
    (result, item) => {
      const value = key(item);
      result[value] = (result[value] ?? 0) + 1;
      return result;
    },
    {}
  );
}

function emptyMetrics() {
  return {
    vehiclesDetected: 0,
    activeTracks: 0,
    emergencyCandidates: 0,
    verifiedEmergencies: 0,
    priorityEvents: 0,
    timeSaved: 0,
    verificationRate: 0,
  };
}