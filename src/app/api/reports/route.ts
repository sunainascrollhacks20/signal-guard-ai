import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getStore } from '@/lib/local-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text =
    typeof value === 'string'
      ? value
      : JSON.stringify(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    }

    const format =
      request.nextUrl.searchParams.get('format') === 'csv'
        ? 'csv'
        : 'json';

    const store = await getStore();

    const activeSessionId =
      store.activeSessionIds[user.id] ??
      store.sessions.find(
        (session) => session.userId === user.id
      )?.id;

    const sessions = store.sessions.filter(
      (session) =>
        session.userId === user.id &&
        session.id === activeSessionId
    );

    const report = {
      generatedAt: new Date().toISOString(),
      sessions: sessions.map((session) => ({
        id: session.id,
        file: session.originalName,
        status: session.status,
        createdAt: session.createdAt,
        detections: session.detections.length,
        tracks: session.tracks.length,
        candidates: session.candidates,
        priorityEvents: session.priorityEvents,
        demoScenario: session.demoScenario ?? false,
        selectedTrackId: session.selectedTrackId ?? null,
        simulationActive: session.simulationActive ?? false,
        decisionEvents: session.decisionEvents ?? [],
        estimatedTimeSaved: session.priorityEvents.reduce(
          (sum, event) =>
            sum + (Number(event.estimatedTimeSaved) || 0),
          0
        ),
      })),
    };

    if (format === 'json') {
      return new Response(
        JSON.stringify(report, null, 2),
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition':
              'attachment; filename="signalguard-report.json"',
          },
        }
      );
    }

    const rows = [
      [
        'Session',
        'File',
        'Status',
        'Created',
        'Detections',
        'Tracks',
        'Candidates',
        'Priority Events',
        'Estimated Time Saved',
      ],
      ...report.sessions.map((session) => [
        session.id,
        session.file,
        session.status,
        session.createdAt,
        session.detections,
        session.tracks,
        session.candidates.length,
        session.priorityEvents.length,
        session.estimatedTimeSaved,
      ]),
    ];

    const csv = rows
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="signalguard-report.csv"',
      },
    });
  } catch (error) {
    console.error('Report error:', error);

    return errorResponse(
      'SERVER_ERROR',
      'Unable to generate report',
      500
    );
  }
}
