// Priority Queue Service Tests
// Comprehensive test suite for priority queue functionality

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  priorityQueueService, 
  PRIORITY_TIERS, 
  ALLOCATION_ALGORITHMS,
  QUEUE_ENTRY_STATUS,
  QUEUE_EVENT_TYPES 
} from '../src/services/priorityQueueService.js';
import { walletWhitelistService } from '../src/services/walletWhitelistService.js';

describe('Priority Queue Service', () => {
  let testQueueId;
  let testAssetContractId;
  let testWallet1;
  let testWallet2;
  let testWallet3;

  beforeEach(async () => {
    // Initialize services
    await walletWhitelistService.initialize();
    
    // Setup test data
    testAssetContractId = 'C' + 'A'.repeat(55);
    testWallet1 = 'G' + 'B'.repeat(55);
    testWallet2 = 'G' + 'C'.repeat(55);
    testWallet3 = 'G' + 'D'.repeat(55);
    
    // Create a test queue
    const queue = await priorityQueueService.createQueue({
      asset_contract_id: testAssetContractId,
      queue_name: 'Test Queue',
      description: 'Test queue for oversubscription',
      allocation_algorithm: ALLOCATION_ALGORITHMS.FIFO,
      total_slots: 100,
      opens_at: new Date().toISOString(),
      closes_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    
    testQueueId = queue.queue_id;
  });

  afterEach(async () => {
    // Cleanup test data
    try {
      const db = await priorityQueueService.getDatabase();
      await db('queue_entries').where({ queue_id: testQueueId }).delete();
      await db('priority_queues').where({ queue_id: testQueueId }).delete();
      await db('queue_events').where({ queue_id: testQueueId }).delete();
      await db('queue_analytics').where({ queue_id: testQueueId }).delete();
      await db('queue_governance').where({ queue_id: testQueueId }).delete();
      await db('wallet_whitelist').whereIn('wallet_address', [testWallet1, testWallet2, testWallet3]).delete();
      await db('wallet_blacklist').whereIn('wallet_address', [testWallet1, testWallet2, testWallet3]).delete();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Queue Management', () => {
    it('should create a new queue', async () => {
      const queue = await priorityQueueService.createQueue({
        asset_contract_id: 'C' + 'X'.repeat(55),
        queue_name: 'New Test Queue',
        allocation_algorithm: ALLOCATION_ALGORITHMS.WEIGHTED,
        total_slots: 50
      });

      expect(queue).toBeDefined();
      expect(queue.queue_id).toBeDefined();
      expect(queue.queue_name).toBe('New Test Queue');
      expect(queue.allocation_algorithm).toBe(ALLOCATION_ALGORITHMS.WEIGHTED);
      expect(queue.total_slots).toBe(50);
      expect(queue.available_slots).toBe(50);
      expect(queue.is_active).toBe(true);
    });

    it('should get queue by ID', async () => {
      const queue = await priorityQueueService.getQueue(testQueueId);

      expect(queue).toBeDefined();
      expect(queue.queue_id).toBe(testQueueId);
      expect(queue.queue_name).toBe('Test Queue');
    });

    it('should get queue by asset contract ID', async () => {
      const queue = await priorityQueueService.getQueueByAsset(testAssetContractId);

      expect(queue).toBeDefined();
      expect(queue.asset_contract_id).toBe(testAssetContractId);
    });

    it('should update queue', async () => {
      const updatedQueue = await priorityQueueService.updateQueue(testQueueId, {
        queue_name: 'Updated Queue Name',
        total_slots: 150
      });

      expect(updatedQueue.queue_name).toBe('Updated Queue Name');
      expect(updatedQueue.total_slots).toBe(150);
    });

    it('should open a queue', async () => {
      await priorityQueueService.closeQueue(testQueueId);
      const queue = await priorityQueueService.openQueue(testQueueId);

      expect(queue.is_active).toBe(true);
    });

    it('should close a queue', async () => {
      const queue = await priorityQueueService.closeQueue(testQueueId);

      expect(queue.is_active).toBe(false);
    });
  });

  describe('Queue Entry Management', () => {
    it('should allow user to join queue', async () => {
      const entry = await priorityQueueService.joinQueue(
        testQueueId,
        testWallet1,
        10,
        { investment_amount: 5000, kyc_verified: true }
      );

      expect(entry).toBeDefined();
      expect(entry.entry_id).toBeDefined();
      expect(entry.user_wallet_address).toBe(testWallet1);
      expect(entry.requested_shares).toBe(10);
      expect(entry.status).toBe(QUEUE_ENTRY_STATUS.PENDING);
      expect(entry.queue_position).toBe(1);
    });

    it('should assign correct tier based on investment', async () => {
      const highInvestmentEntry = await priorityQueueService.joinQueue(
        testQueueId,
        testWallet1,
        10,
        { investment_amount: 100000, kyc_verified: true, whitelisted: true }
      );

      expect(highInvestmentEntry.tier_id).toBe(PRIORITY_TIERS.GOLD.tier_id);

      const lowInvestmentEntry = await priorityQueueService.joinQueue(
        testQueueId,
        testWallet2,
        5,
        { investment_amount: 500 }
      );

      expect(lowInvestmentEntry.tier_id).toBe(PRIORITY_TIERS.COMMUNITY.tier_id);
    });

    it('should prevent duplicate queue entries', async () => {
      await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {});

      await expect(
        priorityQueueService.joinQueue(testQueueId, testWallet1, 5, {})
      ).rejects.toThrow('User already in queue');
    });

    it('should prevent joining closed queue', async () => {
      await priorityQueueService.closeQueue(testQueueId);

      await expect(
        priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {})
      ).rejects.toThrow('Queue is not active');
    });

    it('should allow user to leave queue', async () => {
      const entry = await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {});
      
      const result = await priorityQueueService.leaveQueue(entry.entry_id);

      expect(result.success).toBe(true);
      expect(result.entry_id).toBe(entry.entry_id);
    });

    it('should rebalance positions after withdrawal', async () => {
      const entry1 = await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {});
      const entry2 = await priorityQueueService.joinQueue(testQueueId, testWallet2, 10, {});
      const entry3 = await priorityQueueService.joinQueue(testQueueId, testWallet3, 10, {});

      await priorityQueueService.leaveQueue(entry2.entry_id);

      const position1 = await priorityQueueService.getQueuePosition(entry1.entry_id);
      const position3 = await priorityQueueService.getQueuePosition(entry3.entry_id);

      expect(position1.current_position).toBe(1);
      expect(position3.current_position).toBe(2);
    });

    it('should get queue position', async () => {
      const entry = await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {});
      
      const position = await priorityQueueService.getQueuePosition(entry.entry_id);

      expect(position).toBeDefined();
      expect(position.current_position).toBe(1);
      expect(position.requested_shares).toBe(10);
    });
  });

  describe('Allocation Algorithms', () => {
    beforeEach(async () => {
      // Add multiple users to queue
      await priorityQueueService.joinQueue(testWallet1, 10, { investment_amount: 100000, kyc_verified: true, whitelisted: true });
      await priorityQueueService.joinQueue(testWallet2, 15, { investment_amount: 50000, kyc_verified: true, whitelisted: true });
      await priorityQueueService.joinQueue(testWallet3, 5, { investment_amount: 1000 });
    });

    it('should run FIFO allocation', async () => {
      const queue = await priorityQueueService.updateQueue(testQueueId, {
        allocation_algorithm: ALLOCATION_ALGORITHMS.FIFO
      });

      const allocations = await priorityQueueService.runAllocation(testQueueId);

      expect(allocations).toBeDefined();
      expect(allocations.length).toBeGreaterThan(0);
      expect(allocations[0].allocated_shares).toBeGreaterThan(0);
    });

    it('should run weighted allocation', async () => {
      const queue = await priorityQueueService.updateQueue(testQueueId, {
        allocation_algorithm: ALLOCATION_ALGORITHMS.WEIGHTED
      });

      const allocations = await priorityQueueService.runAllocation(testQueueId);

      expect(allocations).toBeDefined();
      expect(allocations.length).toBeGreaterThan(0);
    });

    it('should run lottery allocation', async () => {
      const queue = await priorityQueueService.updateQueue(testQueueId, {
        allocation_algorithm: ALLOCATION_ALGORITHMS.LOTTERY
      });

      const allocations = await priorityQueueService.runAllocation(testQueueId);

      expect(allocations).toBeDefined();
      expect(allocations.length).toBeGreaterThan(0);
    });

    it('should run hybrid allocation', async () => {
      const queue = await priorityQueueService.updateQueue(testQueueId, {
        allocation_algorithm: ALLOCATION_ALGORITHMS.HYBRID,
        tier_config: {
          [PRIORITY_TIERS.GOLD.tier_id]: { guaranteed_slots: 5, enabled: true }
        }
      });

      const allocations = await priorityQueueService.runAllocation(testQueueId);

      expect(allocations).toBeDefined();
      expect(allocations.length).toBeGreaterThan(0);
    });
  });

  describe('Priority Score Calculation', () => {
    it('should calculate priority score correctly for FIFO', async () => {
      const tier = PRIORITY_TIERS.GOLD;
      const score = priorityQueueService.calculatePriorityScore(tier, 1, ALLOCATION_ALGORITHMS.FIFO);

      expect(score).toBeGreaterThan(0);
    });

    it('should calculate priority score correctly for WEIGHTED', async () => {
      const tier = PRIORITY_TIERS.PLATINUM;
      const score = priorityQueueService.calculatePriorityScore(tier, 1, ALLOCATION_ALGORITHMS.WEIGHTED);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeGreaterThan(
        priorityQueueService.calculatePriorityScore(PRIORITY_TIERS.GOLD, 1, ALLOCATION_ALGORITHMS.WEIGHTED)
      );
    });

    it('should calculate priority score correctly for LOTTERY', async () => {
      const tier = PRIORITY_TIERS.SILVER;
      const score = priorityQueueService.calculatePriorityScore(tier, 1, ALLOCATION_ALGORITHMS.LOTTERY);

      expect(score).toBeGreaterThan(0);
    });
  });

  describe('Dynamic Priority Adjustment', () => {
    it('should adjust priority scores', async () => {
      await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, { investment_amount: 10000 });
      await priorityQueueService.joinQueue(testQueueId, testWallet2, 10, { investment_amount: 5000 });

      await priorityQueueService.adjustPriorityScores(testQueueId, {
        time_weight: 0.1,
        investment_weight: 1.0
      });

      const db = await priorityQueueService.getDatabase();
      const entries = await db('queue_entries').where({ queue_id: testQueueId });

      entries.forEach(entry => {
        expect(entry.priority_score).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Event Logging', () => {
    it('should log queue creation event', async () => {
      const events = await priorityQueueService.getQueueEvents(testQueueId);

      expect(events).toBeDefined();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].event_type).toBe(QUEUE_EVENT_TYPES.QUEUE_CREATED);
    });

    it('should log user join event', async () => {
      await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {});

      const events = await priorityQueueService.getQueueEvents(testQueueId);

      const joinEvent = events.find(e => e.event_type === QUEUE_EVENT_TYPES.USER_JOINED);
      expect(joinEvent).toBeDefined();
      expect(joinEvent.user_wallet_address).toBe(testWallet1);
    });

    it('should log user leave event', async () => {
      const entry = await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {});
      await priorityQueueService.leaveQueue(entry.entry_id);

      const events = await priorityQueueService.getQueueEvents(testQueueId);

      const leaveEvent = events.find(e => e.event_type === QUEUE_EVENT_TYPES.USER_LEFT);
      expect(leaveEvent).toBeDefined();
    });

    it('should log allocation events', async () => {
      await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {});
      await priorityQueueService.runAllocation(testQueueId);

      const events = await priorityQueueService.getQueueEvents(testQueueId);

      const allocationStarted = events.find(e => e.event_type === QUEUE_EVENT_TYPES.ALLOCATION_STARTED);
      const allocationCompleted = events.find(e => e.event_type === QUEUE_EVENT_TYPES.ALLOCATION_COMPLETED);

      expect(allocationStarted).toBeDefined();
      expect(allocationCompleted).toBeDefined();
    });
  });

  describe('Analytics', () => {
    it('should generate analytics snapshot', async () => {
      await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {});
      await priorityQueueService.joinQueue(testQueueId, testWallet2, 15, {});

      const analytics = await priorityQueueService.generateAnalyticsSnapshot(testQueueId);

      expect(analytics).toBeDefined();
      expect(analytics.queue_id).toBe(testQueueId);
      expect(analytics.total_entries).toBe(2);
      expect(analytics.total_requested_shares).toBe(25);
    });

    it('should get analytics for queue', async () => {
      await priorityQueueService.generateAnalyticsSnapshot(testQueueId);

      const analytics = await priorityQueueService.getAnalytics(testQueueId);

      expect(analytics).toBeDefined();
      expect(analytics.queue_id).toBe(testQueueId);
    });
  });

  describe('Governance', () => {
    it('should add governance rule', async () => {
      const rule = await priorityQueueService.addGovernanceRule(testQueueId, {
        rule_name: 'Max Shares Cap',
        rule_type: 'ALLOCATION_CAP',
        rule_config: { max_shares: 50 },
        is_active: true
      });

      expect(rule).toBeDefined();
      expect(rule.rule_name).toBe('Max Shares Cap');
      expect(rule.rule_type).toBe('ALLOCATION_CAP');
    });

    it('should get active governance rules', async () => {
      await priorityQueueService.addGovernanceRule(testQueueId, {
        rule_name: 'KYC Required',
        rule_type: 'KYC_REQUIRED',
        rule_config: {},
        is_active: true
      });

      const rules = await priorityQueueService.getActiveGovernanceRules(testQueueId);

      expect(rules).toBeDefined();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should check governance compliance', async () => {
      const entry = await priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {});
      
      await priorityQueueService.addGovernanceRule(testQueueId, {
        rule_name: 'Max Shares',
        rule_type: 'ALLOCATION_CAP',
        rule_config: { max_shares: 5 },
        is_active: true
      });

      const compliance = await priorityQueueService.checkGovernanceCompliance(entry.entry_id);

      expect(compliance).toBeDefined();
      expect(compliance.compliant).toBe(false);
      expect(compliance.violations).toBeDefined();
    });
  });

  describe('Whitelist Integration', () => {
    it('should use whitelist tier when available', async () => {
      await walletWhitelistService.addToWhitelist(testWallet1, PRIORITY_TIERS.PLATINUM.tier_id, {});

      const entry = await priorityQueueService.joinQueue(
        testQueueId,
        testWallet1,
        10,
        { investment_amount: 100 } // Low investment but whitelisted
      );

      expect(entry.tier_id).toBe(PRIORITY_TIERS.PLATINUM.tier_id);
    });

    it('should prevent blacklisted wallets from joining queue', async () => {
      await walletWhitelistService.addToBlacklist(testWallet1, 'Test reason');

      await expect(
        priorityQueueService.joinQueue(testQueueId, testWallet1, 10, {})
      ).rejects.toThrow('Wallet is blacklisted');
    });
  });
});

describe('Wallet Whitelist Service', () => {
  let testWallet1;
  let testWallet2;

  beforeEach(async () => {
    await walletWhitelistService.initialize();
    testWallet1 = 'G' + 'E'.repeat(55);
    testWallet2 = 'G' + 'F'.repeat(55);
  });

  afterEach(async () => {
    try {
      const db = await walletWhitelistService.getDatabase();
      await db('wallet_whitelist').whereIn('wallet_address', [testWallet1, testWallet2]).delete();
      await db('wallet_blacklist').whereIn('wallet_address', [testWallet1, testWallet2]).delete();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  it('should add wallet to whitelist', async () => {
    const result = await walletWhitelistService.addToWhitelist(testWallet1, PRIORITY_TIERS.GOLD.tier_id, {});

    expect(result.whitelisted).toBe(true);
    expect(result.wallet_address).toBe(testWallet1);
    expect(result.tier_id).toBe(PRIORITY_TIERS.GOLD.tier_id);
  });

  it('should remove wallet from whitelist', async () => {
    await walletWhitelistService.addToWhitelist(testWallet1, null, {});
    const result = await walletWhitelistService.removeFromWhitelist(testWallet1);

    expect(result.whitelisted).toBe(false);
  });

  it('should check if wallet is whitelisted', async () => {
    await walletWhitelistService.addToWhitelist(testWallet1, null, {});

    expect(walletWhitelistService.isWhitelisted(testWallet1)).toBe(true);
    expect(walletWhitelistService.isWhitelisted(testWallet2)).toBe(false);
  });

  it('should add wallet to blacklist', async () => {
    const result = await walletWhitelistService.addToBlacklist(testWallet1, 'Test reason');

    expect(result.blacklisted).toBe(true);
    expect(result.reason).toBe('Test reason');
  });

  it('should remove wallet from blacklist', async () => {
    await walletWhitelistService.addToBlacklist(testWallet1, 'Test reason');
    const result = await walletWhitelistService.removeFromBlacklist(testWallet1);

    expect(result.blacklisted).toBe(false);
  });

  it('should check if wallet is blacklisted', async () => {
    await walletWhitelistService.addToBlacklist(testWallet1, 'Test reason');

    expect(walletWhitelistService.isBlacklisted(testWallet1)).toBe(true);
    expect(walletWhitelistService.isBlacklisted(testWallet2)).toBe(false);
  });

  it('should get wallet status', async () => {
    await walletWhitelistService.addToWhitelist(testWallet1, PRIORITY_TIERS.SILVER.tier_id, { test: 'data' });

    const status = await walletWhitelistService.getWalletStatus(testWallet1);

    expect(status.whitelisted).toBe(true);
    expect(status.blacklisted).toBe(false);
    expect(status.tier_id).toBe(PRIORITY_TIERS.SILVER.tier_id);
    expect(status.metadata.test).toBe('data');
  });

  it('should bulk add wallets to whitelist', async () => {
    const results = await walletWhitelistService.bulkAddToWhitelist([
      { wallet_address: testWallet1, tier_id: PRIORITY_TIERS.GOLD.tier_id },
      { wallet_address: testWallet2, tier_id: PRIORITY_TIERS.SILVER.tier_id }
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('should get whitelist statistics', async () => {
    await walletWhitelistService.addToWhitelist(testWallet1, PRIORITY_TIERS.GOLD.tier_id, {});
    await walletWhitelistService.addToWhitelist(testWallet2, PRIORITY_TIERS.SILVER.tier_id, {});

    const stats = await walletWhitelistService.getStatistics();

    expect(stats.total_whitelisted).toBe(2);
    expect(stats.tier_distribution[PRIORITY_TIERS.GOLD.tier_id]).toBe(1);
    expect(stats.tier_distribution[PRIORITY_TIERS.SILVER.tier_id]).toBe(1);
  });

  it('should update wallet tier', async () => {
    await walletWhitelistService.addToWhitelist(testWallet1, PRIORITY_TIERS.BRONZE.tier_id, {});

    const updated = await walletWhitelistService.updateWalletTier(testWallet1, PRIORITY_TIERS.PLATINUM.tier_id);

    expect(updated.tier_id).toBe(PRIORITY_TIERS.PLATINUM.tier_id);
  });
});
