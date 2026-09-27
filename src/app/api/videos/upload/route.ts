import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getUploadsDirectory, serializeSession, updateStore, type EmergencyType } from '@/lib/local-store';
import { startVideoProcessing } from '@/lib/video-processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedExtensions = new Set(['.mp4', '.avi', '.mov']);
const allowedMimeTypes = new Set(['video/mp4', 'video/avi', 'video/x-msvideo', 'video/quicktime', 'application/octet-stream']);

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    const formData = await request.formData();
    const file = formData.get('video');
    if (!(file instanceof File)) return errorResponse('VALIDATION_ERROR', 'A video file is required', 400);

    const requestedType = String(formData.get('emergencyType') ?? 'AUTO').toUpperCase();
    const inferredType: EmergencyType = requestedType === 'AMBULANCE'
      ? 'AMBULANCE'
      : requestedType === 'FIRE_BRIGADE'
        ? 'FIRE_BRIGADE'
        : requestedType === 'NONE' || requestedType === 'NORMAL' || requestedType === 'NORMAL_TRAFFIC'
          ? 'NONE'
          : /ambulance/i.test(file.name)
            ? 'AMBULANCE'
            : /(fire[-_ ]?brigade|fire[-_ ]?truck|fire[-_ ]?engine|firetruck)/i.test(file.name)
              ? 'FIRE_BRIGADE'
              : 'NONE';
    if (file.size > 500 * 1024 * 1024) return errorResponse('VALIDATION_ERROR', 'File size must be less than 500MB', 413);

    const extension = path.extname(file.name).toLowerCase();
    if (!allowedExtensions.has(extension) || (file.type && !allowedMimeTypes.has(file.type))) {
      return errorResponse('VALIDATION_ERROR', 'Only MP4, AVI, and MOV files are supported', 415);
    }

    const id = await updateStore((store) => store.nextSessionId++);
    const safeName = `${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const directory = getUploadsDirectory();
    await mkdir(directory, { recursive: true });
    const filePath = path.join(directory, safeName);
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    const session = await updateStore((store) => {
      const newSession = {
        id,
        userId: user.id,
        originalName: file.name,
        fileName: safeName,
        filePath,
        fileSize: file.size,
        mimeType: file.type || 'video/mp4',
        emergencyType: inferredType,
        status: 'UPLOADED' as const,
        progress: 0,
        processedFrames: 0,
        totalFrames: 0,
        fps: 0,
        duration: 0,
        createdAt: new Date().toISOString(),
        detections: [],
        tracks: [],
        candidates: [],
        priorityEvents: [],
        decisionEvents: [{ timestamp: new Date().toISOString(), event: 'VIDEO UPLOADED', details: `${file.name} · Scenario: ${inferredType === 'NONE' ? 'NORMAL TRAFFIC' : inferredType.replace('_', ' ')}` }],
      };
      store.sessions.unshift(newSession);
      store.activeSessionIds[user.id] = id;
      return newSession;
    });

    startVideoProcessing(id);
    return successResponse({ session: serializeSession(session) }, 201);
  } catch (error) {
    console.error('Video upload error:', error);
    return errorResponse('UPLOAD_FAILED', 'Unable to upload or process the video', 500);
  }
}
