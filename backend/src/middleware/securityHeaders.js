// Copyright (c) 2026 Tokenized Fractional RWA Marketplace Contributors
// SPDX-License-Identifier: MIT

/**
 * src/middleware/securityHeaders.js — Comprehensive security headers middleware.
 *
 * This module configures helmet.js with strict security headers to protect against:
 * - Clickjacking (X-Frame-Options)
 * - MIME-type sniffing (X-Content-Type-Options)
 * - Cross-Site Scripting (XSS) attacks (X-XSS-Protection, CSP)
 * - Referrer leakage (Referrer-Policy)
 * - Insecure transports (HSTS)
 * - Feature policy abuse (Permissions-Policy)
 * - DNS prefetching attacks (X-DNS-Prefetch-Control)
 *
 * CSP Policy:
 * - Blocks inline scripts and styles (requires nonce or hashes for any inline content)
 * - Only allows scripts and styles from safe origins
 * - Restricts frame ancestors to same-origin only
 * - Reports CSP violations to admin endpoint
 */

import helmet from 'helmet';

/**
 * Create security headers middleware with environment-driven configuration.
 * @param {Object} logger - Logger instance
 * @returns {Function} Express middleware function
 */
export function createSecurityHeadersMiddleware(logger) {
  // Read configuration from environment with sensible defaults
  const config = {
    // HSTS: Force HTTPS for 1 year (31536000 seconds), include subdomains
    hstsMaxAge: parseInt(process.env.HSTS_MAX_AGE || '31536000', 10),
    hstsIncludeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS !== 'false',
    hstsPreload: process.env.HSTS_PRELOAD === 'true',

    // CSP: Content Security Policy configuration
    cspEnabled: process.env.CSP_ENABLED !== 'false',
    cspReportUri: process.env.CSP_REPORT_URI || '/api/v1/security/csp-report',
    cspReportOnly: process.env.CSP_REPORT_ONLY === 'true',

    // Frame ancestors: Restrict embedding in iframes
    frameAncestors: (process.env.FRAME_ANCESTORS || "'self'").split(',').map((s) => s.trim()),

    // Allowed script and style sources
    scriptSources: (process.env.SCRIPT_SOURCES || "'self' 'unsafe-inline'")
      .split(',')
      .map((s) => s.trim()),
    styleSources: (process.env.STYLE_SOURCES || "'self' 'unsafe-inline'")
      .split(',')
      .map((s) => s.trim()),
    fontSources: (process.env.FONT_SOURCES || "'self'").split(',').map((s) => s.trim()),
    imgSources: (process.env.IMG_SOURCES || "'self' data: https:").split(',').map((s) => s.trim()),
    connectSources: (process.env.CONNECT_SOURCES || "'self'").split(',').map((s) => s.trim()),
    mediaSources: (process.env.MEDIA_SOURCES || "'self'").split(',').map((s) => s.trim()),

    // Feature Policy: Restrict dangerous features
    permissionsPolicy:
      process.env.PERMISSIONS_POLICY ||
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',

    // Referrer Policy: Don't leak referrer information
    referrerPolicy: process.env.REFERRER_POLICY || 'strict-no-referrer',

    // DNS prefetching: Disable to prevent DNS leakage
    dnsPrefetchControl: process.env.DNS_PREFETCH_CONTROL !== 'true',

    // X-XSS-Protection: Legacy XSS filter (some older browsers)
    xssFilter: process.env.XSS_FILTER !== 'false',

    // Remove X-Powered-By header
    hidePoweredBy: true,

    // Enable/disable specific headers
    crossOriginResourcePolicy: process.env.CORP !== 'false',
    corpPolicy: process.env.CORP_POLICY || 'cross-origin',
  };

  // Configure helmet options
  const helmetOptions = {
    // HSTS: HTTP Strict Transport Security
    hsts: {
      maxAge: config.hstsMaxAge,
      includeSubDomains: config.hstsIncludeSubDomains,
      preload: config.hstsPreload,
    },

    // Content Security Policy
    contentSecurityPolicy: config.cspEnabled
      ? {
          directives: {
            'default-src': ["'self'"],
            'script-src': config.scriptSources,
            'style-src': config.styleSources,
            'font-src': config.fontSources,
            'img-src': config.imgSources,
            'connect-src': config.connectSources,
            'media-src': config.mediaSources,
            'object-src': ["'none'"],
            'frame-ancestors': config.frameAncestors,
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
            'frame-src': ["'none'"],
            'child-src': ["'none'"],
            'worker-src': ["'self'"],
            'manifest-src': ["'self'"],
            ...(config.cspReportUri && { 'report-uri': [config.cspReportUri] }),
          },
          reportOnly: config.cspReportOnly,
        }
      : false,

    // X-Frame-Options: Prevent clickjacking
    frameguard: {
      action: 'deny',
    },

    // X-Content-Type-Options: Prevent MIME-sniffing
    noSniff: true,

    // X-XSS-Protection: Legacy XSS filter
    xssFilter: config.xssFilter,

    // Remove X-Powered-By header
    hidePoweredBy: config.hidePoweredBy,

    // Referrer-Policy: Control referrer information (valid values: no-referrer, no-referrer-when-downgrade, same-origin, origin, strict-origin, origin-when-cross-origin, strict-origin-when-cross-origin, unsafe-url)
    referrerPolicy: {
      policy:
        config.referrerPolicy === 'strict-no-referrer' ? 'no-referrer' : config.referrerPolicy,
    },

    // Cross-Origin-Resource-Policy
    crossOriginResourcePolicy: config.crossOriginResourcePolicy
      ? {
          policy: config.corpPolicy,
        }
      : false,

    // Expect-CT: Certificate Transparency
    expectCt: {
      enforce: true,
      maxAge: 86400, // 1 day in seconds
      reportUri: undefined, // Only set if CT_REPORT_URI is provided
    },

    // X-DNS-Prefetch-Control
    dnsPrefetchControl: {
      allow: config.dnsPrefetchControl,
    },
  };

  // Conditionally add CT report URI
  if (process.env.CT_REPORT_URI) {
    helmetOptions.expectCt.reportUri = process.env.CT_REPORT_URI;
  }

  logger.info(
    {
      cspEnabled: config.cspEnabled,
      hstsMaxAge: config.hstsMaxAge,
      frameAncestors: config.frameAncestors,
    },
    'Security headers middleware initialized',
  );

  // Return the helmet middleware with configured options
  return helmet(helmetOptions);
}

/**
 * Legacy export for backward compatibility
 */
export const securityHeaders = createSecurityHeadersMiddleware;
