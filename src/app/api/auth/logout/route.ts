import { successResponse, errorResponse } from '@/lib/api-response';
import { getSessionToken, destroySession, clearSessionCookie } from '@/lib/auth';

export async function POST() {
  try {
    const token = await getSessionToken();

    if (token) {
      await destroySession(token);
    }

    await clearSessionCookie();

    return successResponse({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse('SERVER_ERROR', 'An error occurred during logout', 500);
  }
}
