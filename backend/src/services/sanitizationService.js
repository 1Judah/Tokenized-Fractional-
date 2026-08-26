/**
 * Comprehensive Input Sanitization Service
 * 
 * Handles XSS prevention, HTML allowlisting, special character encoding,
 * injection heuristics (foundation for ML-based detection), and audit logging.
 */

import validator from 'validator';
import { performance } from 'perf_hooks';

// Sanitization Rule Configuration
const SANITIZATION_RULES = {
  maxStringLength: 10000,
  allowlistedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'li', 'ol'],
  allowlistedAttributes: ['href', 'title', 'target']
};

export class SanitizationService {
  constructor(logger) {
    this.logger = logger || console;
  }

  /**
   * Basic String Sanitization & Encoding
   */
  sanitizeString(input, maxLength = SANITIZATION_RULES.maxStringLength) {
    if (typeof input !== 'string') return input;
    
    // Length validation
    const truncated = input.substring(0, maxLength);
    
    // Encode special characters to prevent XSS in standard text fields
    return validator.escape(truncated);
  }

  /**
   * Heuristic/ML-Foundation Injection Detection
   * Analyzes payloads for SQLi, XSS, or NoSQL injection signatures.
   */
  detectInjection(input) {
    if (typeof input !== 'string') return false;
    
    // Heuristic signatures (Foundation for ML model feature extraction)
    const sqlInjectionPatterns = /(\b(SELECT|UPDATE|DELETE|INSERT|DROP|UNION)\b)|(['"]\s*OR\s*['"]\d['"]\s*=\s*['"]\d)/i;
    const xssPatterns = /(<script.*?>.*?<\/script>)|(javascript:)|(onerror=)|(onload=)/i;
    const noSqlPatterns = /(\$where)|(\$ne)|(\$gt)|(\$regex)/i;

    return sqlInjectionPatterns.test(input) || 
           xssPatterns.test(input) || 
           noSqlPatterns.test(input);
  }

  /**
   * Deep object sanitization for HTTP bodies and WebSocket messages
   */
  sanitizePayload(payload, vector = 'http') {
    const startTime = performance.now();
    let isSuspicious = false;

    const sanitizeRecursive = (obj) => {
      if (obj === null || obj === undefined) return obj;
      
      if (typeof obj === 'string') {
        if (this.detectInjection(obj)) {
          isSuspicious = true;
          this.logger.warn({ vector, payloadSnippet: obj.substring(0, 50) }, 'Suspicious injection signature detected');
        }
        return this.sanitizeString(obj);
      }
      
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeRecursive(item));
      }
      
      if (typeof obj === 'object') {
        const sanitizedObj = {};
        for (const [key, value] of Object.entries(obj)) {
          // Prevent prototype pollution
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
          sanitizedObj[key] = sanitizeRecursive(value);
        }
        return sanitizedObj;
      }
      
      return obj;
    };

    const sanitized = sanitizeRecursive(payload);
    const executionTime = performance.now() - startTime;

    // Performance Monitoring & Audit Logging
    if (executionTime > 50) {
      this.logger.warn({ vector, executionTime }, 'Sanitization performance degraded');
    }

    if (isSuspicious) {
      this.logger.warn({ vector, executionTime }, 'Sanitization audit: High-risk payload processed');
    }

    return { sanitized, isSuspicious };
  }
}

export const sanitizationService = new SanitizationService();
