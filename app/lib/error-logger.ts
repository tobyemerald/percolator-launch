import * as Sentry from '@sentry/nextjs';

/**
 * Fields that should be excluded from logs/Sentry to prevent sensitive data leakage
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'authorization',
  'auth',
  'secret',
  'key',
  'apiKey',
  'private_key',
  'privateKey',
  'accessToken',
  'refreshToken',
  'credential',
  'credentials',
  'jwt',
]);

/**
 * Sanitize context object to remove sensitive fields before logging
 * Returns a new object with sensitive keys removed/redacted
 */
function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(context)) {
    const lowerKey = key.toLowerCase();
    
    // Check if this is a sensitive key
    if (SENSITIVE_KEYS.has(lowerKey) || SENSITIVE_KEYS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeContext(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Check if we should log (development/debug environments only)
 */
function shouldLogToConsole(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.LOG_LEVEL === 'debug';
}

/**
 * Structured error context for logging
 */
export interface ErrorLogContext {
  context: string; // e.g., 'devnet-airdrop', 'markets-list'
  endpoint?: string; // e.g., '/api/markets'
  [key: string]: unknown;
}

/**
 * Log an error with structured context to both console and Sentry
 * 
 * @param error - The error to log
 * @param context - Context information for debugging
 * 
 * @example
 * catch (err) {
 *   logError(err, {
 *     context: 'fetch-prices',
 *     endpoint: '/api/prices',
 *     wallet: walletAddress,
 *   });
 * }
 */
export function logError(
  error: unknown,
  context: ErrorLogContext
): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Only include non-sensitive context fields
  const { context: contextName, endpoint, ...otherFields } = context;
  const sanitizedContext = sanitizeContext(otherFields);
  
  const enrichedContext = {
    context: contextName,
    endpoint: endpoint || 'unknown',
    ...sanitizedContext,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  };

  // Console logging for development/debugging only
  if (shouldLogToConsole()) {
    console.error(`[${contextName}] Error occurred:`, {
      error: errorMsg,
      stack: errorStack,
      ...enrichedContext,
    });
  }

  // Sentry reporting for production monitoring (all environments)
  Sentry.captureException(error, {
    tags: {
      context: contextName,
      endpoint: endpoint || 'unknown',
      severity: 'error',
    },
    extra: enrichedContext,
  });
}

/**
 * Log a warning with structured context
 * 
 * @param message - Warning message
 * @param context - Context information
 * 
 * @example
 * logWarning('Rate limit exceeded', {
 *   context: 'airdrop-gate',
 *   wallet: userWallet,
 *   remaining: 0,
 * });
 */
export function logWarning(
  message: string,
  context: ErrorLogContext
): void {
  // Only include non-sensitive context fields
  const { context: contextName, endpoint, ...otherFields } = context;
  const sanitizedContext = sanitizeContext(otherFields);
  
  const enrichedContext = {
    context: contextName,
    endpoint: endpoint || 'unknown',
    ...sanitizedContext,
    timestamp: new Date().toISOString(),
  };

  // Console logging for development/debugging only
  if (shouldLogToConsole()) {
    console.warn(`[${contextName}] Warning:`, message, enrichedContext);
  }

  // Sentry reporting for all environments
  Sentry.captureMessage(message, {
    level: 'warning',
    tags: { context: contextName, endpoint: endpoint || 'unknown' },
    extra: enrichedContext,
  });
}

/**
 * Log informational message (minimal overhead)
 */
export function logInfo(
  message: string,
  context: ErrorLogContext
): void {
  if (shouldLogToConsole()) {
    const { context: contextName, endpoint, ...otherFields } = context;
    const sanitizedContext = sanitizeContext(otherFields);
    
    console.info(`[${contextName}] Info:`, message, {
      endpoint: endpoint || 'unknown',
      ...sanitizedContext,
    });
  }
}
