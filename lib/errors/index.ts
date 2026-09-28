export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Unauthorized', code = 'AUTH_UNAUTHORIZED', details?: unknown) {
    super(code, message, 401, details);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super('NOT_FOUND', message, 404, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT', details?: unknown) {
    super(code, message, 409, details);
    this.name = 'ConflictError';
  }
}

export class VersionConflictError extends ConflictError {
  constructor(details?: unknown) {
    super('Version conflict - resource has been modified', 'VERSION_CONFLICT', details);
    this.name = 'VersionConflictError';
  }
}

export class EncryptionError extends AppError {
  constructor(message = 'Encryption failed', details?: unknown) {
    super('ENCRYPTION_ERROR', message, 500, details);
    this.name = 'EncryptionError';
  }
}

export class DecryptionError extends AppError {
  constructor(message = 'Decryption failed', details?: unknown) {
    super('DECRYPTION_ERROR', message, 500, details);
    this.name = 'DecryptionError';
  }
}

export async function handleRouteError(error: unknown): Promise<Response> {
  console.error('[Route Error]', error instanceof Error ? error.message : error);

  if (error instanceof AppError) {
    return Response.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined && { details: error.details }),
        },
      },
      { status: error.statusCode }
    );
  }

  const validationErr = error as { isValidationError?: boolean; validationErrors?: unknown };
  if (error instanceof Error && validationErr.isValidationError) {
    return Response.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: validationErr.validationErrors,
        },
      },
      { status: 400 }
    );
  }

  return Response.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    { status: 500 }
  );
}
