import { NextResponse } from 'next/server';

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export function successResponse<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

export function errorResponse(
  code: string,
  message: string,
  status = 400
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    { status }
  );
}

export function unauthorizedResponse(message = 'Unauthorized'): NextResponse<ApiErrorResponse> {
  return errorResponse('UNAUTHORIZED', message, 401);
}

export function forbiddenResponse(message = 'Forbidden'): NextResponse<ApiErrorResponse> {
  return errorResponse('FORBIDDEN', message, 403);
}

export function notFoundResponse(message = 'Not found'): NextResponse<ApiErrorResponse> {
  return errorResponse('NOT_FOUND', message, 404);
}

export function validationErrorResponse(message: string): NextResponse<ApiErrorResponse> {
  return errorResponse('VALIDATION_ERROR', message, 422);
}

export function serverErrorResponse(message = 'Internal server error'): NextResponse<ApiErrorResponse> {
  return errorResponse('SERVER_ERROR', message, 500);
}

// Helper to safely parse JSON from request
export async function safeParseJson<T>(request: Request): Promise<T | null> {
  try {
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return null;
    }
    return await request.json();
  } catch (error) {
    return null;
  }
}
