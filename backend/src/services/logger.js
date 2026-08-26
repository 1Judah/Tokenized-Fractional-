// Copyright (c) 2026 Tokenized Fractional RWA Marketplace Contributors
// SPDX-License-Identifier: MIT

/**
 * src/services/logger.js — Structured JSON logging with correlation IDs.
 *
 * Enhanced Pino logger with:
 * - Correlation ID tracking across requests
 * - Sensitive data redaction (passwords, tokens, private keys)
 * - JSON formatting for log aggregators (Datadog/ELK)
 */

import pino from 'pino';
import { LOG_LEVEL, NODE_ENV } from '../config.js';

const isDev = NODE_ENV === 'development';

// Sensitive field patterns to redact
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /private[_\s]?key/i,
  /api[_\s]?key/i,
  /authorization/i,
  /bearer/i,
  /credit[_\s]?card/i,
  /ssn/i,
  /pin/i,
];

// Redact sensitive values in log objects
function redactSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const redacted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key in redacted) {
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitiveData(redacted[key]);
    }
  }

  return redacted;
}

// Pino redact configuration
const redactConfig = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.body.password',
  'req.body.secret',
  'req.body.token',
  'req.body.privateKey',
  'req.body.apiKey',
  'res.headers["set-cookie"]',
  'error.config.headers.Authorization',
  'error.config.headers["x-api-key"]',
];

export const logger = pino({
  level: LOG_LEVEL,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
  redact: redactConfig,
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { 
        colorize: true, 
        ignore: 'pid,hostname',
        messageFormat: (log) => {
          const correlationId = log.correlationId ? `[${log.correlationId}] ` : '';
          return `${correlationId}${log.msg}`;
        },
      },
    },
  }),
  base: {
    pid: process.pid,
    hostname: require('os').hostname(),
    environment: NODE_ENV,
  },
});

/**
 * Create a child logger with correlation ID
 */
export function createLoggerWithCorrelation(correlationId) {
  return logger.child({ correlationId });
}

/**
 * Log with automatic sensitive data redaction
 */
export function logWithRedaction(level, message, data = {}) {
  const redactedData = redactSensitiveData(data);
  logger[level]({ ...redactedData }, message);
}

export default logger;
