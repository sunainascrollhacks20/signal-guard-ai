import { stat } from 'fs/promises';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSession } from '@/lib/local-store';
import { getVideoFileStream } from '@/lib/video-processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 });
  const { id } = await context.params;
  const session = await getSession(Number(id));
  if (!session || session.userId !== user.id) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } }, { status: 404 });
  const fileStats = await stat(session.filePath);
  return new NextResponse(getVideoFileStream(session.filePath) as unknown as BodyInit, {
    headers: {
      'Content-Type': session.mimeType,
      'Content-Length': String(fileStats.size),
      'Content-Disposition': `inline; filename="${session.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
    },
  });
}
