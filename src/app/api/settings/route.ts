import { errorResponse, successResponse } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth';
import { getStore, updateStore } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
  return successResponse({ settings: (await getStore()).settings });
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
    const body = await request.json();
    const settings = await updateStore((store) => {
      store.settings = {
        processingFps: Math.max(1, Math.min(10, Number(body.processingFps) || 2)),
        confidenceThreshold: Math.max(0, Math.min(1, Number(body.confidenceThreshold) || 0.35)),
        verificationSensitivity: ['Low', 'Medium', 'High'].includes(body.verificationSensitivity) ? body.verificationSensitivity : 'Medium',
        privacyMode: Boolean(body.privacyMode),
      };
      return store.settings;
    });
    return successResponse({ settings });
  } catch (error) {
    console.error('Settings error:', error);
    return errorResponse('VALIDATION_ERROR', 'Invalid settings payload', 400);
  }
}
