/**
 * client.ts - API Client for MONOLITH Backend
 *
 * Priority 2: Wire frontend to real backend
 *
 * FEATURES:
 * - Centralized HTTP client with base URL
 * - JSON request/response handling
 * - Error mapping to typed errors
 * - Feature flag for mock mode
 */

// ============================================================================
// Configuration
// ============================================================================

/** Backend base URL - defaults to local dev server */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/** Feature flag to use mock data instead of real API */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

// ============================================================================
// Error Types
// ============================================================================

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

export class ApiRequestError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.statusCode = error.statusCode;
    this.details = error.details;
  }
}

// ============================================================================
// Thai Error Messages (S18)
// ============================================================================

/**
 * จุดเดียวที่แปลง HTTP status เป็นข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง
 * คืน null เมื่อ status ไม่อยู่ใน map (ใช้ข้อความ server ตามเดิม)
 * code/statusCode/details ใน ApiRequestError ไม่ถูกแตะ — โค้ดเดิมอ่านต่อได้
 */
export function thaiErrorMessage(
  statusCode: number,
  options: { requiredRole?: string } = {}
): string | null {
  switch (statusCode) {
    case 401:
      return 'เซสชันหมดอายุ — เข้าสู่ระบบใหม่';
    case 403:
      return options.requiredRole
        ? `สิทธิ์ไม่พอ (ต้องเป็น ${options.requiredRole})`
        : 'สิทธิ์ไม่พอ';
    case 409:
      return 'ข้อมูลถูกเปลี่ยนโดยคนอื่น — รีเฟรชก่อน';
    default:
      return null;
  }
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

// ============================================================================
// HTTP Client
// ============================================================================

/**
 * Make a GET request to the API.
 */
export async function apiGet<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return handleResponse<T>(response);
}

/**
 * Make a POST request to the API.
 */
export async function apiPost<T>(
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(response);
}

/**
 * Make a PUT request to the API.
 */
export async function apiPut<T>(
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(response);
}

/**
 * Make a DELETE request to the API.
 */
export async function apiDelete<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return handleResponse<T>(response);
}

// ============================================================================
// Response Handler
// ============================================================================

async function handleResponse<T>(response: Response): Promise<T> {
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    // Non-JSON response
    if (!response.ok) {
      throw new ApiRequestError({
        code: 'PARSE_ERROR',
        message: thaiErrorMessage(response.status) ?? 'Failed to parse response',
        statusCode: response.status,
      });
    }
    return undefined as T;
  }

  if (!response.ok) {
    const errorData = data as {
      error?: string;
      message?: string;
      code?: string;
      requiredRole?: string;
    };
    throw new ApiRequestError({
      code: errorData.code || errorData.error || 'UNKNOWN_ERROR',
      message:
        thaiErrorMessage(response.status, { requiredRole: errorData.requiredRole }) ??
        errorData.message ??
        'Request failed',
      statusCode: response.status,
      details: data as Record<string, unknown>,
    });
  }

  return data as T;
}

// ============================================================================
// Health Check
// ============================================================================

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  storage?: {
    bundleCount: number;
    totalSizeMB: number;
  };
  queue?: {
    pending: number;
    completed: number;
  };
  keys?: number;
}

/**
 * Check backend health.
 */
export async function checkHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/api/health');
}

// ============================================================================
// Connection Test
// ============================================================================

/**
 * Test connection to backend.
 * Returns true if backend is reachable, false otherwise.
 */
export async function testConnection(): Promise<boolean> {
  try {
    await checkHealth();
    return true;
  } catch {
    return false;
  }
}
