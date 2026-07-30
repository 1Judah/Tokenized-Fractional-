import { Router } from 'express';

export function createRateLimitAdminRoutes(rateLimiterService, adminAuth, options = {}) {
  const router = Router();
  const {
    analytics,
    anomalyDetector,
    geoLimiter,
    billingService,
  } = options;

  router.get('/stats', adminAuth, (req, res) => {
    try {
      const allStats = rateLimiterService.getAllStats();
      res.json({
        data: allStats,
        total: allStats.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      req.log?.error({ error: error.message }, 'Failed to get rate limit stats');
      res.status(500).json({ error: 'Failed to get rate limit stats' });
    }
  });

  router.get('/stats/:apiKey', adminAuth, (req, res) => {
    try {
      const stats = rateLimiterService.getStats(req.params.apiKey);
      if (!stats) {
        return res.status(404).json({ error: 'No stats found for this API key' });
      }
      res.json({ data: stats });
    } catch (error) {
      req.log?.error({ error: error.message }, 'Failed to get key stats');
      res.status(500).json({ error: 'Failed to get key stats' });
    }
  });

  router.get('/tiers', adminAuth, (_req, res) => {
    try {
      const tiers = rateLimiterService.getAvailableTiers();
      res.json({ data: tiers });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get tiers' });
    }
  });

  router.put('/tiers/:tier', adminAuth, (req, res) => {
    try {
      const { tier } = req.params;
      const config = req.body;

      rateLimiterService.updateTierConfig(tier, config);
      res.json({
        message: `Tier '${tier}' configuration updated`,
        tier,
        config: rateLimiterService.getTierConfig(tier),
      });
    } catch (error) {
      req.log?.error({ error: error.message }, 'Failed to update tier');
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/configure', adminAuth, (req, res) => {
    try {
      const { apiKey, tier, ...rest } = req.body;

      if (!apiKey || !tier) {
        return res.status(400).json({ error: 'apiKey and tier are required' });
      }

      rateLimiterService.configureApiKey(apiKey, tier, rest);

      if (billingService) {
        billingService.createSubscription(apiKey, tier, rest).catch(() => {});
      }

      req.log?.info({ apiKey: apiKey.slice(0, 8) + '...', tier }, 'API key rate limit configured');
      res.json({ message: 'API key configured', apiKey: apiKey.slice(0, 8) + '...', tier });
    } catch (error) {
      req.log?.error({ error: error.message }, 'Failed to configure API key');
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/reset/:apiKey', adminAuth, async (req, res) => {
    try {
      await rateLimiterService.resetKey(req.params.apiKey);
      res.json({ message: 'Rate limit counters reset', apiKey: req.params.apiKey.slice(0, 8) + '...' });
    } catch (error) {
      req.log?.error({ error: error.message }, 'Failed to reset key');
      res.status(500).json({ error: 'Failed to reset rate limit counters' });
    }
  });

  if (analytics) {
    router.get('/analytics/summary', adminAuth, (_req, res) => {
      try {
        const summary = analytics.getSummary();
        res.json({ data: summary });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get analytics summary' });
      }
    });

    router.get('/analytics/export', adminAuth, (req, res) => {
      try {
        const { from, to, format } = req.query;
        const data = analytics.exportData({ from, to, format });
        res.json({ data });
      } catch (error) {
        res.status(500).json({ error: 'Failed to export analytics' });
      }
    });

    router.get('/analytics/key/:apiKey', adminAuth, (req, res) => {
      try {
        const stats = analytics.getDetailedStats(req.params.apiKey);
        res.json({ data: stats });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get key analytics' });
      }
    });
  }

  if (anomalyDetector) {
    router.get('/anomaly/model', adminAuth, (_req, res) => {
      try {
        const modelInfo = anomalyDetector.getModelInfo();
        res.json({ data: modelInfo });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get model info' });
      }
    });

    router.post('/anomaly/train', adminAuth, async (req, res) => {
      try {
        const result = await anomalyDetector.train(req.body.data);
        res.json({ data: result });
      } catch (error) {
        res.status(500).json({ error: 'Failed to train model' });
      }
    });

    router.put('/anomaly/config', adminAuth, (req, res) => {
      try {
        const { burstThreshold, timeWindowMs, confidenceThreshold } = req.body;
        if (burstThreshold) anomalyDetector.burstThreshold = burstThreshold;
        if (timeWindowMs) anomalyDetector.timeWindowMs = timeWindowMs;
        if (confidenceThreshold) anomalyDetector.confidenceThreshold = confidenceThreshold;
        res.json({ message: 'Anomaly detector configured', config: anomalyDetector.getModelInfo() });
      } catch (error) {
        res.status(500).json({ error: 'Failed to configure anomaly detector' });
      }
    });
  }

  if (geoLimiter) {
    router.get('/geo/stats', adminAuth, (_req, res) => {
      try {
        const stats = geoLimiter.getCountryStats();
        res.json({ data: stats });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get geo stats' });
      }
    });

    router.post('/geo/block', adminAuth, (req, res) => {
      try {
        const { country } = req.body;
        if (!country) return res.status(400).json({ error: 'country is required' });
        geoLimiter.blockedCountries.add(country.toUpperCase());
        res.json({ message: `Country ${country.toUpperCase()} blocked` });
      } catch (error) {
        res.status(500).json({ error: 'Failed to block country' });
      }
    });

    router.post('/geo/unblock', adminAuth, (req, res) => {
      try {
        const { country } = req.body;
        if (!country) return res.status(400).json({ error: 'country is required' });
        geoLimiter.blockedCountries.delete(country.toUpperCase());
        res.json({ message: `Country ${country.toUpperCase()} unblocked` });
      } catch (error) {
        res.status(500).json({ error: 'Failed to unblock country' });
      }
    });

    router.post('/geo/restrict', adminAuth, (req, res) => {
      try {
        const { country, limit } = req.body;
        if (!country || !limit) return res.status(400).json({ error: 'country and limit are required' });
        geoLimiter.restrictedCountries.set(country.toUpperCase(), parseInt(limit));
        res.json({ message: `Country ${country.toUpperCase()} restricted to ${limit} req/hr` });
      } catch (error) {
        res.status(500).json({ error: 'Failed to restrict country' });
      }
    });
  }

  if (billingService) {
    router.get('/billing/subscription/:apiKey', adminAuth, (req, res) => {
      try {
        const sub = billingService.getSubscription(req.params.apiKey);
        if (!sub) return res.status(404).json({ error: 'No subscription found' });
        res.json({ data: sub });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get subscription' });
      }
    });

    router.post('/billing/upgrade', adminAuth, async (req, res) => {
      try {
        const { apiKey, tier } = req.body;
        if (!apiKey || !tier) return res.status(400).json({ error: 'apiKey and tier are required' });

        const sub = await billingService.upgradeSubscription(apiKey, tier);
        rateLimiterService.configureApiKey(apiKey, tier);

        res.json({ message: 'Subscription upgraded', data: sub });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    router.post('/billing/cancel', adminAuth, async (req, res) => {
      try {
        const { apiKey } = req.body;
        if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });

        const result = await billingService.cancelSubscription(apiKey);
        if (!result) return res.status(404).json({ error: 'No subscription found' });

        res.json({ message: 'Subscription cancelled' });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });
  }

  router.get('/health', (_req, res) => {
    const services = {
      rateLimiter: { status: 'ok', activeKeys: rateLimiterService.records.size },
    };
    if (analytics) services.analytics = { status: 'ok', enabled: analytics.enabled };
    if (anomalyDetector) services.anomalyDetector = { status: 'ok', enabled: anomalyDetector.enabled };
    if (geoLimiter) services.geoLimiter = { status: 'ok', enabled: geoLimiter.enabled };
    if (billingService) services.billing = { status: 'ok', enabled: billingService.enabled };

    res.json({ status: 'ok', timestamp: new Date().toISOString(), services });
  });

  return router;
}
