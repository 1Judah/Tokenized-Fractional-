// Priority Queue API Routes
// REST API endpoints for priority queue management

import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { priorityQueueService, PRIORITY_TIERS, ALLOCATION_ALGORITHMS, QUEUE_ENTRY_STATUS } from '../services/priorityQueueService.js';

export const v1 = Router();

// === Queue Management Routes ===

/**
 * @openapi
 * /api/v1/queues:
 *   post:
 *     tags: [Priority Queue]
 *     summary: Create a new priority queue
 *     description: Create a new priority queue for an asset with specified configuration
 *     security: [{ ApiKeyAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               asset_contract_id:
 *                 type: string
 *               queue_name:
 *                 type: string
 *               description:
 *                 type: string
 *               allocation_algorithm:
 *                 type: string
 *                 enum: [FIFO, WEIGHTED, LOTTERY, HYBRID]
 *               total_slots:
 *                 type: integer
 *               opens_at:
 *                 type: string
 *                 format: date-time
 *               closes_at:
 *                 type: string
 *                 format: date-time
 *               tier_config:
 *                 type: object
 *               governance_rules:
 *                 type: object
 *     responses:
 *       201:
 *         description: Queue created successfully
 */
v1.post('/queues', adminAuth, writeLimiter, async (req, res) => {
  try {
    const queue = await priorityQueueService.createQueue(req.body);
    res.status(201).json(queue);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/{queue_id}:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get queue by ID
 *     description: Retrieve queue details including current status
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Queue details
 */
v1.get('/queues/:queue_id', async (req, res) => {
  try {
    const queue = await priorityQueueService.getQueue(req.params.queue_id);
    if (!queue) {
      return res.status(404).json({ error: 'Queue not found' });
    }
    res.json(queue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/asset/{asset_contract_id}:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get queue by asset contract ID
 *     description: Retrieve the active queue for a specific asset
 *     parameters:
 *       - in: path
 *         name: asset_contract_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Queue details
 */
v1.get('/queues/asset/:asset_contract_id', async (req, res) => {
  try {
    const queue = await priorityQueueService.getQueueByAsset(req.params.asset_contract_id);
    if (!queue) {
      return res.status(404).json({ error: 'No active queue found for this asset' });
    }
    res.json(queue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/{queue_id}:
 *   patch:
 *     tags: [Priority Queue]
 *     summary: Update queue
 *     description: Update queue configuration (admin only)
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated queue
 */
v1.patch('/queues/:queue_id', adminAuth, writeLimiter, async (req, res) => {
  try {
    const queue = await priorityQueueService.updateQueue(req.params.queue_id, req.body);
    res.json(queue);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/{queue_id}/open:
 *   post:
 *     tags: [Priority Queue]
 *     summary: Open queue
 *     description: Open a queue for new entries (admin only)
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Queue opened
 */
v1.post('/queues/:queue_id/open', adminAuth, writeLimiter, async (req, res) => {
  try {
    const queue = await priorityQueueService.openQueue(req.params.queue_id);
    res.json(queue);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/{queue_id}/close:
 *   post:
 *     tags: [Priority Queue]
 *     summary: Close queue
 *     description: Close a queue for new entries (admin only)
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Queue closed
 */
v1.post('/queues/:queue_id/close', adminAuth, writeLimiter, async (req, res) => {
  try {
    const queue = await priorityQueueService.closeQueue(req.params.queue_id);
    res.json(queue);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// === Queue Entry Routes ===

/**
 * @openapi
 * /api/v1/queues/{queue_id}/join:
 *   post:
 *     tags: [Priority Queue]
 *     summary: Join a priority queue
 *     description: Add a user to a priority queue with requested shares
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_wallet_address:
 *                 type: string
 *               requested_shares:
 *                 type: integer
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Successfully joined queue
 */
v1.post('/queues/:queue_id/join', async (req, res) => {
  try {
    const { user_wallet_address, requested_shares, metadata = {} } = req.body;
    
    if (!user_wallet_address || !requested_shares) {
      return res.status(400).json({ error: 'user_wallet_address and requested_shares are required' });
    }

    const entry = await priorityQueueService.joinQueue(
      req.params.queue_id,
      user_wallet_address,
      requested_shares,
      metadata
    );
    
    res.status(201).json(entry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/entries/{entry_id}/leave:
 *   post:
 *     tags: [Priority Queue]
 *     summary: Leave a priority queue
 *     description: Remove user entry from queue
 *     parameters:
 *       - in: path
 *         name: entry_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully left queue
 */
v1.post('/queues/entries/:entry_id/leave', async (req, res) => {
  try {
    const result = await priorityQueueService.leaveQueue(req.params.entry_id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/entries/{entry_id}/position:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get queue position
 *     description: Get current position and status for a queue entry
 *     parameters:
 *       - in: path
 *         name: entry_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Queue position details
 */
v1.get('/queues/entries/:entry_id/position', async (req, res) => {
  try {
    const position = await priorityQueueService.getQueuePosition(req.params.entry_id);
    res.json(position);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// === Allocation Routes ===

/**
 * @openapi
 * /api/v1/queues/{queue_id}/allocate:
 *   post:
 *     tags: [Priority Queue]
 *     summary: Run allocation process
 *     description: Execute allocation algorithm for queue (admin only)
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Allocation results
 */
v1.post('/queues/:queue_id/allocate', adminAuth, writeLimiter, async (req, res) => {
  try {
    const allocations = await priorityQueueService.runAllocation(req.params.queue_id);
    res.json({ allocations, count: allocations.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/{queue_id}/adjust-priority:
 *   post:
 *     tags: [Priority Queue]
 *     summary: Adjust priority scores
 *     description: Dynamically adjust priority scores based on factors (admin only)
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               time_weight:
 *                 type: number
 *               investment_weight:
 *                 type: number
 *               loyalty_weight:
 *                 type: number
 *     responses:
 *       200:
 *         description: Priority scores adjusted
 */
v1.post('/queues/:queue_id/adjust-priority', adminAuth, writeLimiter, async (req, res) => {
  try {
    await priorityQueueService.adjustPriorityScores(req.params.queue_id, req.body);
    res.json({ success: true, message: 'Priority scores adjusted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// === Event Routes ===

/**
 * @openapi
 * /api/v1/queues/{queue_id}/events:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get queue events
 *     description: Retrieve event log for a queue
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: Queue events
 */
v1.get('/queues/:queue_id/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = await priorityQueueService.getQueueEvents(req.params.queue_id, limit);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === Analytics Routes ===

/**
 * @openapi
 * /api/v1/queues/{queue_id}/analytics:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get queue analytics
 *     description: Retrieve analytics data for a queue
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: snapshot_date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Queue analytics
 */
v1.get('/queues/:queue_id/analytics', async (req, res) => {
  try {
    const analytics = await priorityQueueService.getAnalytics(
      req.params.queue_id,
      req.query.snapshot_date
    );
    if (!analytics) {
      return res.status(404).json({ error: 'Analytics not found' });
    }
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/{queue_id}/analytics/snapshot:
 *   post:
 *     tags: [Priority Queue]
 *     summary: Generate analytics snapshot
 *     description: Generate a daily analytics snapshot for a queue (admin only)
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Analytics snapshot created
 */
v1.post('/queues/:queue_id/analytics/snapshot', adminAuth, writeLimiter, async (req, res) => {
  try {
    const analytics = await priorityQueueService.generateAnalyticsSnapshot(req.params.queue_id);
    res.status(201).json(analytics);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// === Governance Routes ===

/**
 * @openapi
 * /api/v1/queues/{queue_id}/governance:
 *   post:
 *     tags: [Priority Queue]
 *     summary: Add governance rule
 *     description: Add a governance rule to a queue (admin only)
 *     security: [{ ApiKeyAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rule_name:
 *                 type: string
 *               rule_type:
 *                 type: string
 *                 enum: [ALLOCATION_CAP, TIME_WINDOW, VERIFICATION_REQUIRED, WHITELIST_ONLY, KYC_REQUIRED]
 *               rule_config:
 *                 type: object
 *               is_active:
 *                 type: boolean
 *               effective_from:
 *                 type: string
 *                 format: date-time
 *               effective_until:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Governance rule added
 */
v1.post('/queues/:queue_id/governance', adminAuth, writeLimiter, async (req, res) => {
  try {
    const rule = await priorityQueueService.addGovernanceRule(req.params.queue_id, req.body);
    res.status(201).json(rule);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/{queue_id}/governance:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get active governance rules
 *     description: Retrieve all active governance rules for a queue
 *     parameters:
 *       - in: path
 *         name: queue_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Active governance rules
 */
v1.get('/queues/:queue_id/governance', async (req, res) => {
  try {
    const rules = await priorityQueueService.getActiveGovernanceRules(req.params.queue_id);
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /api/v1/queues/entries/{entry_id}/compliance:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Check governance compliance
 *     description: Check if an entry complies with governance rules
 *     parameters:
 *       - in: path
 *         name: entry_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Compliance status
 */
v1.get('/queues/entries/:entry_id/compliance', async (req, res) => {
  try {
    const compliance = await priorityQueueService.checkGovernanceCompliance(req.params.entry_id);
    res.json(compliance);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// === Notification Routes ===

/**
 * @openapi
 * /api/v1/queues/notifications/{user_wallet_address}:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get pending notifications
 *     description: Retrieve pending notifications for a user
 *     parameters:
 *       - in: path
 *         name: user_wallet_address
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pending notifications
 */
v1.get('/queues/notifications/:user_wallet_address', async (req, res) => {
  try {
    const notifications = await priorityQueueService.getPendingNotifications(req.params.user_wallet_address);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === Configuration Routes ===

/**
 * @openapi
 * /api/v1/queues/config/tiers:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get priority tier definitions
 *     description: Retrieve all available priority tier definitions
 *     responses:
 *       200:
 *         description: Priority tier definitions
 */
v1.get('/queues/config/tiers', (req, res) => {
  res.json(PRIORITY_TIERS);
});

/**
 * @openapi
 * /api/v1/queues/config/algorithms:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get allocation algorithms
 *     description: Retrieve available allocation algorithms
 *     responses:
 *       200:
 *         description: Allocation algorithms
 */
v1.get('/queues/config/algorithms', (req, res) => {
  res.json(ALLOCATION_ALGORITHMS);
});

/**
 * @openapi
 * /api/v1/queues/config/status:
 *   get:
 *     tags: [Priority Queue]
 *     summary: Get queue entry statuses
 *     description: Retrieve available queue entry status values
 *     responses:
 *       200:
 *         description: Queue entry statuses
 */
v1.get('/queues/config/status', (req, res) => {
  res.json(QUEUE_ENTRY_STATUS);
});
