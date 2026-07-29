// Copyright (c) 2026 Tokenized Fractional RWA Marketplace Contributors
// SPDX-License-Identifier: MIT

import 'dotenv/config';
import { validateEnv } from './env.js';
validateEnv();
import { randomUUID } from 'crypto';
import express from 'express';
import { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setTimeout } from 'timers/promises';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './docs.js';
import yoga from './graphql/index.js';
import { cacheGet, cacheSet, cacheDel } from './cache.js';
import { RateLimiterService } from './src/services/rateLimiterService.js';
import { AnomalyDetector } from './src/services/anomalyDetector.js';
import { GeoLimiter } from './src/services/geoLimiter.js';
import { RateLimitAnalytics } from './src/services/rateLimitAnalytics.js';
import { BillingService } from './src/services/billingService.js';
import { createRateLimiter } from './src/middleware/rateLimiter.js';
import { createRateLimitAdminRoutes } from './src/routes/rateLimitAdmin.js';
import { applyCursorPagination, CursorError, paginationErrorHandler, SORT_FIELDS } from './src/services/cursorPagination.js';
import { parsePaginationParams } from './src/middleware/cursorPagination.js';
import swaggerUi from 'swagger-ui-express';
import { generateOpenapiSpec } from './src/services/openapiService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// multer memoryStorage keeps the file in memory as a Buffer (req.file.buffer).
// We never write documents to disk — they go straight from memory to Pinata.
// 10MB limit is generous for PDFs and title deeds.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    // Only accept PDFs and common image formats for now
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, JPEG, PNG, WEBP`));
    }
  },
});
const PORT = process.env.PORT || 3001;
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

// ── Logger ────────────────────────────────────────────────────────────────────


// ── Sentry ────────────────────────────────────────────────────────────────────
if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
      ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
      : 0.1,
    profilesSampleRate: process.env.SENTRY_PROFILES_SAMPLE_RATE
      ? parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE)
      : 0.1,
    integrations: [
      Sentry.httpIntegration({ breadcrumbs: true }),
      Sentry.expressIntegration(),
    ],
  });
  logger.info({ dsnPrefix: process.env.SENTRY_DSN.slice(0, 30) }, 'Sentry initialized');
}

// ── Data helpers ──────────────────────────────────────────────────────────────
function getDataFile() {
  return join(__dirname, process.env.DATA_FILE || 'data.json');
}

function loadData() {
  const file = getDataFile();
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    logger.error('Corrupted data file, starting fresh');
    return {};
  }
}

function saveData(data) {
  writeFileSync(getDataFile(), JSON.stringify(data, null, 2), 'utf-8');
}

export function validateContractId(id) {
  return typeof id === 'string' && id.length >= 50 && id.startsWith('C');
}

export function validateRwaBody(body) {
  const required = ['title', 'location', 'description', 'assetType'];
  const missing = required.filter(f => !body[f]);
  if (missing.length > 0) return `Missing required fields: ${missing.join(', ')}`;
  return null;
}

function cacheKey(contractId) {
  return `rwa:${contractId}`;
}

// ── Full-Text Search Index (Issue #181) ────────────────────────────────────────
// In-memory inverted index: term → Set of contractIds
let _searchIndex = null;

/**
 * Tokenise a string into lowercase words (removes punctuation).
 */
export function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Build or rebuild the full-text inverted index from the current data store.
 * Called once at startup and after every mutating operation.
 */
export function buildSearchIndex(data) {
  const index = {}; // term → { contractId: tf }
  const docCount = {}; // contractId → total token count

  for (const [contractId, meta] of Object.entries(data)) {
    const fields = [
      { value: meta.title,       weight: 3 },
      { value: meta.location,    weight: 2 },
      { value: meta.description, weight: 1 },
      { value: meta.assetType,   weight: 2 },
    ];

    const termFreq = {};
    let total = 0;
    for (const { value, weight } of fields) {
      const tokens = tokenize(value);
      for (const token of tokens) {
        termFreq[token] = (termFreq[token] || 0) + weight;
        total += weight;
      }
    }
    docCount[contractId] = total || 1;

    for (const [term, freq] of Object.entries(termFreq)) {
      if (!index[term]) index[term] = {};
      index[term][contractId] = freq / docCount[contractId]; // TF
    }
  }

  _searchIndex = { index, totalDocs: Object.keys(data).length };
  return _searchIndex;
}

/**
 * Ensure the index is built (lazy init).
 */
function getSearchIndex() {
  if (!_searchIndex) buildSearchIndex(loadData());
  return _searchIndex;
}

/**
 * Sync the search index after data mutations (fire-and-forget safe).
 */
export function syncSearchIndex() {
  try {
    buildSearchIndex(loadData());
  } catch (err) {
    logger.error({ err }, 'Failed to sync search index');
  }
}

/**
 * Score assets for a query using TF-IDF-like relevance.
 * Returns an array of { contractId, score } sorted descending.
 */
export function scoreSearch(query, data) {
  const { index, totalDocs } = getSearchIndex();
  const terms = tokenize(query);
  if (terms.length === 0) return Object.keys(data).map(id => ({ contractId: id, score: 1 }));

  const scores = {};
  for (const term of terms) {
    const postings = index[term] || {};
    const df = Object.keys(postings).length;
    if (df === 0) continue;
    // IDF: log(N / df)
    const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
    for (const [contractId, tf] of Object.entries(postings)) {
      scores[contractId] = (scores[contractId] || 0) + tf * idf;
    }
  }

  return Object.entries(scores)
    .map(([contractId, score]) => ({ contractId, score }))
    .sort((a, b) => b.score - a.score);
}

function adminAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const expected = process.env.ADMIN_API_KEY || 'dev-key-change-in-production';
  if (!apiKey || apiKey !== expected) {
    req.log?.warn({ hasKey: !!apiKey }, 'Unauthorized API key attempt');
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key', requestId: req.requestId });
  }
  req.log?.info('Admin API key used');
  next();
}

const ASSET_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

function isApproved(asset) {
  return !asset.status || asset.status === ASSET_STATUS.APPROVED;
}

// ── Webhook helpers ────────────────────────────────────────────────────────────
const WEBHOOK_EVENTS = {
  CREATED: 'asset.created',
  UPDATED: 'asset.updated',
  DELETED: 'asset.deleted',
  APPROVED: 'asset.approved',
  REJECTED: 'asset.rejected',
};

const WEBHOOK_VALID_EVENTS = Object.values(WEBHOOK_EVENTS);

function getWebhookFile() {
  return join(__dirname, process.env.WEBHOOK_DATA_FILE || 'webhooks.json');
}

function loadWebhooks() {
  const file = getWebhookFile();
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    logger.error('Corrupted webhook data file, starting fresh');
    return {};
  }
}

function saveWebhooks(data) {
  writeFileSync(getWebhookFile(), JSON.stringify(data, null, 2), 'utf-8');
}

function validateWebhookBody(body) {
  if (!body.url || typeof body.url !== 'string') return 'url is required';
  try {
    new URL(body.url);
  } catch {
    return 'url must be a valid URL';
  }
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return 'events must be a non-empty array';
  }
  const invalid = body.events.filter(e => !WEBHOOK_VALID_EVENTS.includes(e));
  if (invalid.length > 0) {
    return `Invalid events: ${invalid.join(', ')}. Valid: ${WEBHOOK_VALID_EVENTS.join(', ')}`;
  }
  return null;
}

function generateWebhookId() {
  return 'wh_' + randomUUID().replace(/-/g, '').slice(0, 16);
}

async function deliverToWebhook(webhook, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': payload.event,
    'X-Webhook-Delivery': randomUUID(),
  };

  const response = await fetch(webhook.url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Webhook responded with ${response.status}`);
  }
}

async function deliverWebhookWithRetry(webhook, payload, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await deliverToWebhook(webhook, payload);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await setTimeout(1000 * attempt);
      }
    }
  }
  throw lastError;
}

async function fireWebhooks(event, data) {
  const webhooks = loadWebhooks();
  const active = Object.values(webhooks).filter(w => w.active && w.events.includes(event));
  if (active.length === 0) {
    logger.info({ event, webhookCount: Object.keys(webhooks).length }, 'No active webhooks for event');
    return;
  }
  logger.info({ event, count: active.length, urls: active.map(w => w.url) }, 'Firing webhooks');

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const results = await Promise.allSettled(
    active.map(w => deliverWebhookWithRetry(w, payload)),
  );

  let changed = false;
  active.forEach((webhook, i) => {
    if (results[i].status === 'rejected') {
      webhook.failureCount = (webhook.failureCount || 0) + 1;
      webhook.lastFailureAt = new Date().toISOString();
      if (webhook.failureCount >= 5) {
        webhook.active = false;
        logger.warn({ webhookId: webhook.id, url: webhook.url }, 'Webhook auto-disabled after 5 failures');
      }
    } else {
      webhook.failureCount = 0;
      webhook.lastSuccessAt = new Date().toISOString();
    }
    webhook.updatedAt = new Date().toISOString();
    changed = true;
  });

  if (changed) {
    saveWebhooks(webhooks);
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();

// Sentry request handler must be the first middleware
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

app.use(helmet());
app.use(cors({ origin: CORS_ORIGINS, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'x-api-key', 'X-Request-ID'] }));
app.use(express.json({ limit: '10kb' }));

// ── Request ID middleware ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
});

// Validation middleware — comprehensive schema validation for all API endpoints (#260)
// Disabled in test mode to avoid breaking existing tests
if (process.env.NODE_ENV !== 'test') {
  app.use(createValidationMiddleware({ strict: false }));
}

// Request logging middleware (silent in test)
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: req => req.url === '/health' },
  genReqId: req => req.requestId,
}));

// ── Rate Limiting Services ─────────────────────────────────────────────────────
const rateLimitAnalytics = new RateLimitAnalytics({ logger });
const anomalyDetector = new AnomalyDetector({ logger });
const geoLimiter = new GeoLimiter({ logger });
const billingService = new BillingService({ logger });

const rateLimiterService = new RateLimiterService({
  logger,
  analytics: rateLimitAnalytics,
  anomalyDetector,
  geoLimiter,
  billingService,
});

// Configure default admin API key with enterprise tier
const adminApiKey = process.env.ADMIN_API_KEY || 'dev-key-change-in-production';
rateLimiterService.configureApiKey(adminApiKey, 'enterprise', {
  email: process.env.ADMIN_EMAIL,
});

const rateLimiter = createRateLimiter(rateLimiterService, {
  onBlocked: (req, res, result) => {
    const body = { error: 'Rate limit exceeded' };
    if (result.reason) body.reason = result.reason;
    if (result.upgradePrompt) body.upgrade = result.upgradePrompt;
    req.log?.warn({ reason: result.reason, apiKey: req.headers['x-api-key']?.slice(0, 8) }, 'Request rate limited');
    return res.status(result.status || 429).json(body);
  },
});

// Apply rate limiter to all API routes (skip admin routes which have their own auth)
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/admin/rate-limits')) return next();
  rateLimiter(req, res, next);
});

// Write limiter for admin write operations (POST/DELETE)
const writeLimiter = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) return next();
  const result = await rateLimiterService.checkRateLimit(apiKey, {
    ip: req.ip,
    path: req.path,
    method: req.method,
  });
  if (!result.allowed) {
    return res.status(429).json({ error: 'Too many write requests', reason: result.reason });
  }
  next();
};

// ── OpenAPI / Swagger ──────────────────────────────────────────────────────────
const openapiSpec = generateOpenapiSpec();
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: 'RWA Marketplace API Docs',
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
  },
}));

app.get('/api-docs.json', (_req, res) => {
  res.json(openapiSpec);
});

app.get('/api-docs.yaml', (_req, res) => {
  res.type('text/yaml').send(openapiSpec ? 'To generate YAML, use the JSON endpoint or request with Accept: text/yaml' : '');
});

// ── Prometheus Metrics ─────────────────────────────────────────────────────────
import prometheus from 'express-prom-bundle';

const metricsMiddleware = prometheus({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: { app: 'rwa-backend' },
  promClient: {
    collectDefaultMetrics: { timeout: 5000 },
  },
});

app.use(metricsMiddleware);

app.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', metricsMiddleware.promClient.register.contentType);
  res.send(await metricsMiddleware.promClient.register.metrics());
});

// ── API Documentation ──────────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'RWA Marketplace API Docs',
}));

// ── GraphQL Endpoint ───────────────────────────────────────────────────
app.use('/api/graphql', yoga);

app.get('/api-docs.json', (_req, res) => {
  res.json(swaggerSpec);
});

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/admin/verify:
 *   get:
 *     tags: [Admin]
 *     summary: Verify admin API key
 *     description: Returns ok:true if the x-api-key header matches the configured ADMIN_API_KEY. Used for testing authentication.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: API key is valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminVerifyResponse'
 *             example:
 *               ok: true
 *       401:
 *         description: Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: 'Unauthorized: invalid or missing API key'
 */
app.get('/api/admin/verify', adminAuth, (_req, res) => {
  res.json({ ok: true });
});

// Rate limit admin routes (mounted before the rate limiter that skips them)
const rateLimitAdminRoutes = createRateLimitAdminRoutes(rateLimiterService, adminAuth, {
  analytics: rateLimitAnalytics,
  anomalyDetector,
  geoLimiter,
  billingService,
});
app.use('/api/admin/rate-limits', rateLimitAdminRoutes);

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: System health check
 *     description: Returns overall system status, timestamp, and dependency health (storage, Redis). Returns 503 degraded status if Redis is configured but unreachable.
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: System is degraded (dependency failure)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
app.get('/health', async (_req, res) => {
  const deploymentColor = process.env.DEPLOYMENT_COLOR || 'local';
  const serviceName = process.env.SERVICE_NAME || 'backend';
  const buildId = process.env.BUILD_ID || process.env.GITHUB_SHA || 'local';
  const deps = {
    storage: { status: 'ok' },
    redis: { status: 'not_configured' },
  };

  // Check Redis if configured
  if (process.env.REDIS_URL) {
    try {
      const Redis = (await import('ioredis')).default;
      // Reuse the same TLS options as the main cache client so the health
      // check honours REDIS_TLS, REDIS_TLS_CA, REDIS_TLS_CERT, REDIS_TLS_KEY
      // and REDIS_TLS_REJECT_UNAUTHORIZED.
      const tlsOptions = buildTlsOptions();
      const pingClient = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 2000,
        maxRetriesPerRequest: 0,
        ...(tlsOptions && { tls: tlsOptions }),
      });
      await pingClient.connect();
      await pingClient.ping();
      pingClient.disconnect();
      deps.redis = { status: 'ok' };
    } catch {
      deps.redis = { status: 'error', message: 'Redis configured but unreachable' };
      return res.status(503).json({ status: 'degraded', timestamp: new Date().toISOString(), dependencies: deps });
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: {
      name: serviceName,
      deploymentColor,
      buildId,
    },
    dependencies: deps,
  });
});

/**
 * @openapi
 * /api/rwa:
 *   get:
 *     tags: [Assets]
 *     summary: List RWA assets (cursor-based pagination)
 *     description: Returns a paginated list of RWA asset metadata. Supports cursor-based pagination, field-based sorting, asset type filtering, and text search. Results are cached in Redis when available. The default sort is by createdAt descending (most recent first).
 *     parameters:
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *         description: Cursor for forward pagination (received from previous response's nextCursor)
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *         description: Cursor for backward pagination (received from previous response's prevCursor)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Maximum number of items per page
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, title, contractId, assetType, updatedAt, totalValuation]
 *           default: createdAt
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort direction (defaults per field; createdAt desc, title asc, etc.)
 *       - in: query
 *         name: assetType
 *         schema:
 *           type: string
 *         description: Filter by asset type (case-insensitive exact match)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for case-insensitive matching against title and description
 *     responses:
 *       200:
 *         description: Paginated list of assets
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedAssetList'
 *       400:
 *         description: Invalid cursor or pagination parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/rwa', (req, res, next) => {
  try {
    const data = loadData();
    const assets = Object.entries(data).map(([contractId, meta]) => ({ contractId, ...meta }));

    const paginationParams = parsePaginationParams(req);
    const result = applyCursorPagination(assets, paginationParams);

    res.json(result);

    // Cache the asset list result (fire-and-forget)
    cacheSet('rwa:all', result).catch(() => {});
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/rwa/{contractId}:
 *   get:
 *     tags: [Assets]
 *     summary: Get single RWA asset metadata
 *     description: Returns metadata for a specific RWA asset by contract ID. Results are cached in Redis (if configured) for subsequent requests.
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 50
 *           pattern: ^C[A-Za-z0-9]+$
 *         description: Stellar contract ID of the asset
 *     responses:
 *       200:
 *         description: Asset metadata
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Asset'
 *       404:
 *         description: Asset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: 'Asset metadata not found'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/rwa/:contractId', async (req, res) => {
  const { contractId } = req.params;

  const cached = await cacheGet(cacheKey(contractId));
  if (cached) return res.json(withCdnAssetUrls(cached));

  const data = loadData();
  const asset = data[contractId];
  if (!asset) return res.status(404).json({ error: 'Asset metadata not found' });
  if (!isApproved(asset)) return res.status(404).json({ error: 'Asset metadata not found' });

  const result = { contractId, ...asset };
  // Cache individual asset (fire-and-forget)
  cacheSet(cacheKey(contractId), result).catch(() => {});
  res.json(withCdnAssetUrls(result));
});

/**
 * @openapi
 * /api/rwa:
 *   post:
 *     tags: [Assets]
 *     summary: Create or update RWA asset metadata
 *     description: Creates a new asset metadata record or updates an existing one. Requires admin authentication. The contractId must be at least 50 characters starting with "C". Required fields: title, location, description, assetType. Invalidates Redis cache on success.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssetInput'
 *           example:
 *             contractId: 'CCF7LXM6U6H6Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z7Z'
 *             title: 'Luxury Manhattan Condo Unit 12B'
 *             location: 'New York, NY'
 *             description: 'A fully furnished 2-bedroom condo'
 *             assetType: 'real_estate'
 *             imageUrl: 'https://ipfs.io/ipfs/QmX...'
 *             totalValuation: '2500000.00'
 *             documents: ['https://ipfs.io/ipfs/QmY...']
 *     responses:
 *       201:
 *         description: Asset created/updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssetCreatedResponse'
 *       400:
 *         description: Invalid request body or contract ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit exceeded (write limiter)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/api/rwa', adminAuth, writeLimiter, async (req, res) => {
  const { contractId, ...metadata } = req.body;

  if (!contractId || !validateContractId(contractId)) {
    return res.status(400).json({ error: 'Invalid contract ID. Must start with C and be at least 50 characters.' });
  }

  const validationError = validateRwaBody(metadata);
  if (validationError) return res.status(400).json({ error: validationError });

  const data = loadData();
  const now = new Date().toISOString();
  data[contractId] = {
    id: metadata.id || contractId,
    title: metadata.title,
    location: metadata.location,
    description: metadata.description,
    assetType: metadata.assetType,
    imageUrl: metadata.imageUrl || '',
    totalValuation: metadata.totalValuation || '',
    documents: Array.isArray(metadata.documents) ? metadata.documents : [],
    status: ASSET_STATUS.PENDING,
    submittedAt: now,
    createdAt: metadata.createdAt || now,
    updatedAt: now,
  };
  saveData(data);

  // Invalidate caches and sync search index (fire-and-forget)
  cacheDel('rwa:all').catch(() => {});
  syncSearchIndex();
  fireWebhooks(WEBHOOK_EVENTS.CREATED, { contractId, ...data[contractId] }).catch(() => {});

  req.log?.info({ contractId }, 'Asset created/updated');
  res.status(201).json(withCdnAssetUrls({ contractId, ...data[contractId] }));
});

/**
 * @openapi
 * /api/rwa/{contractId}:
 *   delete:
 *     tags: [Assets]
 *     summary: Delete RWA asset metadata
 *     description: Deletes an asset metadata record by contract ID. Requires admin authentication. Invalidates Redis cache on success.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 50
 *         description: Stellar contract ID of the asset to delete
 *     responses:
 *       200:
 *         description: Asset deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeleteResponse'
 *       401:
 *         description: Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Asset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Rate limit exceeded (write limiter)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.delete('/api/rwa/:contractId', adminAuth, writeLimiter, async (req, res) => {
  const { contractId } = req.params;
  const data = loadData();
  if (!data[contractId]) return res.status(404).json({ error: 'Asset metadata not found' });

  const deleted = { contractId, ...data[contractId] };

  // Unpin all IPFS documents before deleting the asset record.
  // Fire-and-forget — we don't block the response on Pinata's API.
  if (Array.isArray(deleted.documents) && deleted.documents.length > 0) {
    Promise.allSettled(
      deleted.documents
        .filter(d => d.cid)
        .map(d => unpinFromIPFS(d.cid))
    ).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          logger.warn({ cid: deleted.documents[i].cid, err: r.reason }, 'Failed to unpin document');
        }
      });
    });
  }

  delete data[contractId];
  saveData(data);

  // Invalidate caches and sync search index (fire-and-forget)
  cacheDel('rwa:all', cacheKey(contractId)).catch(() => {});
  syncSearchIndex();
  fireWebhooks(WEBHOOK_EVENTS.DELETED, deleted).catch(() => {});

  req.log?.info({ contractId }, 'Asset deleted');
  res.json({ message: 'Asset metadata deleted', contractId });
});

// Cursor pagination error handler
app.use(paginationErrorHandler);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', requestId: _req.requestId });
});

// Sentry error handler must be registered before other error handlers
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error', requestId: req.requestId });
});

export { app, rateLimiterService, rateLimitAnalytics, anomalyDetector, geoLimiter, billingService };

/**
 * Initialize Apollo GraphQL Server
 * Returns a promise that resolves when the server is ready
 */
async function initializeApolloServer(expressApp, httpServer) {
  try {
    // Create data layer object for resolvers
    const dataLayer = {
      loadData,
      saveData,
      validateContractId,
      validateRwaBody,
      scoreSearch,
      syncSearchIndex,
    };

    // Create Apollo Server instance
    const server = new ApolloServer({
      typeDefs,
      resolvers: createResolvers(dataLayer),
      context: ({ req }) => {
        // Check if request has admin API key
        const apiKey = req.headers['x-api-key'];
        const isAdmin = apiKey === process.env.ADMIN_API_KEY;
        return { isAdmin, apiKey };
      },
      formatError: (error) => {
        logger.error({ error: error.message, extensions: error.extensions }, 'GraphQL error');
        return {
          message: error.message,
          extensions: {
            code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
          },
        };
      },
    });

    await server.start();
    logger.info('Apollo Server started');

    // Mount GraphQL middleware at /graphql
    expressApp.use(
      '/graphql',
      expressMiddleware(server, {
        context: async ({ req }) => {
          const apiKey = req.headers['x-api-key'];
          const isAdmin = apiKey === process.env.ADMIN_API_KEY;
          return { isAdmin, apiKey };
        },
      })
    );

    logger.info('GraphQL endpoint available at /graphql');

    // Initialize WebSocket subscriptions if httpServer is provided
    if (httpServer) {
      initializeGraphQLSubscriptions(httpServer, server);
      logger.info('GraphQL subscriptions initialized at /graphql/subscriptions');
    }

    return server;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to initialize Apollo Server');
    throw error;
  }
}

if (process.env.NODE_ENV !== 'test') {
  import('./cache.js').then(({ initClient }) => initClient());
  app.listen(PORT, () => {
    logger.info({
      port: PORT,
      rateLimiterTiers: Object.keys(rateLimiterService.getAvailableTiers()).length,
      anomalyDetection: anomalyDetector._enabled,
      geoLimiting: geoLimiter.enabled,
      billing: billingService.enabled,
    }, 'RWA Off-chain Metadata Backend started');
  });
}
