export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: Record<string, unknown>;
}

export function formatSuccess<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(meta && { meta }),
  };
}

export function formatError(
  code: string,
  message: string,
  details?: unknown,
  statusCode = 400
): { response: ApiResponse<null>; status: number } {
  return {
    response: {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined && { details }),
      },
    },
    status: statusCode,
  };
}

export function jsonSuccess<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit): Response {
  return Response.json(formatSuccess(data, meta), {
    status: 200,
    ...init,
  });
}

export function jsonError(
  code: string,
  message: string,
  details?: unknown,
  statusCode = 400,
  init?: ResponseInit
): Response {
  const { response } = formatError(code, message, details, statusCode);
  return Response.json(response, {
    status: statusCode,
    ...init,
  });
}

export const ErrorCodes = {
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_INVALID_API_KEY: 'AUTH_INVALID_API_KEY',
  AUTH_ALREADY_INITIALIZED: 'AUTH_ALREADY_INITIALIZED',
  AUTH_NOT_INITIALIZED: 'AUTH_NOT_INITIALIZED',
  AUTH_INVALID_PASSWORD: 'AUTH_INVALID_PASSWORD',
  AUTH_API_KEY_REVOKED: 'AUTH_API_KEY_REVOKED',

  VALIDATION_ERROR: 'VALIDATION_ERROR',

  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',

  INTERNAL_ERROR: 'INTERNAL_ERROR',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
  DECRYPTION_ERROR: 'DECRYPTION_ERROR',

  IMPORT_INVALID_FORMAT: 'IMPORT_INVALID_FORMAT',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
