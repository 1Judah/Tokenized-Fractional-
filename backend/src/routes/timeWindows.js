// Copyright (c) 2026 Tokenized Fractional RWA Marketplace Contributors
// SPDX-License-Identifier: MIT

/**
 * src/routes/timeWindows.js — Modular time window route handlers
 *
 * Public endpoints:
 * - GET /time-windows/:contractId — List time windows for an asset
 * - GET /time-windows/:contractId/:windowId — Get single time window
 * - GET /time-windows/:contractId/:windowId/events — Get events for a window
 * - GET /time-windows/:contractId/:windowId/analytics — Get window analytics
 * - GET /time-windows/:contractId/analytics/aggregate — Aggregate analytics
 * - GET /time-windows/:contractId/analytics/trends — Usage trends
 *
 * Admin endpoints (require x-api-key):
 * - POST /time-windows/:contractId — Create time window metadata
 * - PUT /time-windows/:contractId/:windowId — Update time window metadata
 * - DELETE /time-windows/:contractId/:windowId — Delete time window metadata
 * - POST /time-windows/:contractId/:windowId/log — Manually log an event
 */

import { Router } from 'express';
import { validateContractId } from '../validators/rwaValidator.js';
import { loadData, saveData } from '../services/dataService.js';
import { cacheDel } from '../../cache.js';

/**
 * Factory function to create time window routes
 * @param {Object} timeWindowService - TimeWindowService instance
 * @param {Object} logger
 * @param {Function} adminAuth - Admin auth middleware
 * @returns {Router}
 */
export function createTimeWindowRoutes(timeWindowService, logger, adminAuth) {
  const router = Router();

  // ── GET /:contractId — List time windows ──────────────────────────────────
  router.get('/:contractId', (req, res) => {
    try {
      const { contractId } = req.params;
      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      const data = loadData();
      const asset = data[contractId];
      if (!asset) return res.status(404).json({ error: 'Asset not found' });

      const windows = asset.timeWindows || {};
      const list = Object.entries(windows).map(([windowId, meta]) => ({
        windowId,
        ...meta,
      }));

      res.json({ data: list, total: list.length });
    } catch (error) {
      logger?.error({ error: error.message, contractId: req.params.contractId }, 'Failed to list time windows');
      res.status(500).json({ error: 'Failed to list time windows' });
    }
  });

  // ── GET /:contractId/:windowId — Get single time window ───────────────────
  router.get('/:contractId/:windowId', (req, res) => {
    try {
      const { contractId, windowId } = req.params;
      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      const data = loadData();
      const asset = data[contractId];
      if (!asset) return res.status(404).json({ error: 'Asset not found' });

      const windowMeta = asset.timeWindows?.[windowId];
      if (!windowMeta) return res.status(404).json({ error: 'Time window not found' });

      res.json({ windowId, ...windowMeta });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to get time window');
      res.status(500).json({ error: 'Failed to get time window' });
    }
  });

  // ── GET /:contractId/:windowId/events — Get window events ─────────────────
  router.get('/:contractId/:windowId/events', async (req, res) => {
    try {
      const { contractId, windowId } = req.params;
      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      const { limit, offset } = req.query;
      const events = await timeWindowService.getWindowEvents(contractId, windowId, {
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0,
      });

      res.json({ data: events, total: events.length });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to get window events');
      res.status(500).json({ error: 'Failed to get window events' });
    }
  });

  // ── GET /:contractId/:windowId/analytics — Get window analytics ───────────
  router.get('/:contractId/:windowId/analytics', async (req, res) => {
    try {
      const { contractId, windowId } = req.params;
      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      const analytics = await timeWindowService.getWindowAnalytics(contractId, windowId);
      res.json({ data: analytics });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to get window analytics');
      res.status(500).json({ error: 'Failed to get window analytics' });
    }
  });

  // ── GET /:contractId/analytics/aggregate — Aggregate analytics ────────────
  router.get('/:contractId/analytics/aggregate', async (req, res) => {
    try {
      const { contractId } = req.params;
      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      const analytics = await timeWindowService.getAssetTimeWindowAnalytics(contractId);
      res.json({ data: analytics });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to get aggregate analytics');
      res.status(500).json({ error: 'Failed to get aggregate analytics' });
    }
  });

  // ── GET /:contractId/analytics/trends — Usage trends ──────────────────────
  router.get('/:contractId/analytics/trends', async (req, res) => {
    try {
      const { contractId } = req.params;
      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      const days = req.query.days ? parseInt(req.query.days) : 30;
      const trends = await timeWindowService.getWindowTrends(contractId, { days });
      res.json({ data: trends });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to get window trends');
      res.status(500).json({ error: 'Failed to get window trends' });
    }
  });

  // ── GET /:contractId/events — All events for asset's time windows ─────────
  router.get('/:contractId/events', async (req, res) => {
    try {
      const { contractId } = req.params;
      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      const { eventType, from, to, limit, offset } = req.query;
      const events = await timeWindowService.getAssetWindowEvents(contractId, {
        eventType,
        from,
        to,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      });

      res.json({ data: events, total: events.length });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to get asset window events');
      res.status(500).json({ error: 'Failed to get asset window events' });
    }
  });

  // ── POST /:contractId — Create time window metadata (admin) ──────────────
  router.post('/:contractId', adminAuth, (req, res) => {
    try {
      const { contractId } = req.params;
      const { windowId, title, description, imageUrl, termsUrl } = req.body;

      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      if (!windowId || !title || !description) {
        return res.status(400).json({
          error: 'Missing required fields: windowId, title, description',
        });
      }

      const data = loadData();
      if (!data[contractId]) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      if (!data[contractId].timeWindows) {
        data[contractId].timeWindows = {};
      }

      const now = new Date().toISOString();
      data[contractId].timeWindows[windowId] = {
        title,
        description,
        imageUrl: imageUrl || '',
        termsUrl: termsUrl || '',
        createdAt: data[contractId].timeWindows[windowId]?.createdAt || now,
        updatedAt: now,
      };

      saveData(data);
      cacheDel(`rwa:${contractId}`).catch(() => {});

      timeWindowService.logEvent({
        eventType: 'window.metadata.created',
        contractId,
        windowId,
        details: { title, description },
      }).catch(() => {});

      logger?.info({ contractId, windowId }, 'Time window metadata created');
      res.status(201).json({ windowId, ...data[contractId].timeWindows[windowId] });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to create time window');
      res.status(500).json({ error: 'Failed to create time window' });
    }
  });

  // ── PUT /:contractId/:windowId — Update time window metadata (admin) ──────
  router.put('/:contractId/:windowId', adminAuth, (req, res) => {
    try {
      const { contractId, windowId } = req.params;
      const { title, description, imageUrl, termsUrl } = req.body;

      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      const data = loadData();
      const asset = data[contractId];
      if (!asset) return res.status(404).json({ error: 'Asset not found' });

      if (!asset.timeWindows?.[windowId]) {
        return res.status(404).json({ error: 'Time window not found' });
      }

      const existing = asset.timeWindows[windowId];
      asset.timeWindows[windowId] = {
        ...existing,
        title: title || existing.title,
        description: description || existing.description,
        imageUrl: imageUrl !== undefined ? imageUrl : existing.imageUrl,
        termsUrl: termsUrl !== undefined ? termsUrl : existing.termsUrl,
        updatedAt: new Date().toISOString(),
      };

      saveData(data);
      cacheDel(`rwa:${contractId}`).catch(() => {});

      timeWindowService.logEvent({
        eventType: 'window.metadata.updated',
        contractId,
        windowId,
        details: { title, description },
      }).catch(() => {});

      logger?.info({ contractId, windowId }, 'Time window metadata updated');
      res.json({ windowId, ...asset.timeWindows[windowId] });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to update time window');
      res.status(500).json({ error: 'Failed to update time window' });
    }
  });

  // ── DELETE /:contractId/:windowId — Delete time window metadata (admin) ───
  router.delete('/:contractId/:windowId', adminAuth, (req, res) => {
    try {
      const { contractId, windowId } = req.params;

      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      const data = loadData();
      const asset = data[contractId];
      if (!asset?.timeWindows?.[windowId]) {
        return res.status(404).json({ error: 'Time window not found' });
      }

      delete asset.timeWindows[windowId];
      saveData(data);
      cacheDel(`rwa:${contractId}`).catch(() => {});

      timeWindowService.logEvent({
        eventType: 'window.metadata.deleted',
        contractId,
        windowId,
      }).catch(() => {});

      logger?.info({ contractId, windowId }, 'Time window metadata deleted');
      res.json({ message: 'Time window metadata deleted', windowId });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to delete time window');
      res.status(500).json({ error: 'Failed to delete time window' });
    }
  });

  // ── POST /:contractId/:windowId/log — Manually log event (admin) ──────────
  router.post('/:contractId/:windowId/log', adminAuth, async (req, res) => {
    try {
      const { contractId, windowId } = req.params;
      const { eventType, adminAddress, buyerAddress, details } = req.body;

      if (!validateContractId(contractId)) {
        return res.status(400).json({ error: 'Invalid contract ID' });
      }

      if (!eventType) {
        return res.status(400).json({ error: 'Missing required field: eventType' });
      }

      const event = await timeWindowService.logEvent({
        eventType,
        contractId,
        windowId,
        adminAddress,
        buyerAddress,
        details,
      });

      if (!event) {
        return res.status(500).json({ error: 'Failed to log event' });
      }

      logger?.info({ contractId, windowId, eventType }, 'Time window event logged manually');
      res.status(201).json({ data: event });
    } catch (error) {
      logger?.error({ error: error.message }, 'Failed to log time window event');
      res.status(500).json({ error: 'Failed to log event' });
    }
  });

  return router;
}
