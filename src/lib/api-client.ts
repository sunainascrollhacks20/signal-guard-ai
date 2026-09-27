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

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private baseUrl = '';

  async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        credentials: 'same-origin',
      });

      // Check content type
      const contentType = response.headers.get('content-type');
      
      if (!contentType?.includes('application/json')) {
        throw new ApiError(
          'INVALID_RESPONSE',
          `Expected JSON response but got ${contentType || 'unknown'}`,
          response.status
        );
      }

      const data: ApiResponse<T> = await response.json();

      if (!response.ok) {
        if (data.success === false) {
          throw new ApiError(
            data.error.code,
            data.error.message,
            response.status
          );
        }
        throw new ApiError(
          'HTTP_ERROR',
          `HTTP ${response.status}`,
          response.status
        );
      }

      if (data.success === false) {
        throw new ApiError(data.error.code, data.error.message, response.status);
      }

      return data.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ApiError('NETWORK_ERROR', 'Network connection failed');
      }

      throw new ApiError(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'An unknown error occurred'
      );
    }
  }

  async get<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
