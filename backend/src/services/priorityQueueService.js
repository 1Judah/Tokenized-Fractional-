// Priority Queue Service for Oversubscription Management
// Handles sophisticated priority queue system with tiered allocation

import { randomUUID } from 'crypto';
import { getDatabase } from './database.js';
import { walletWhitelistService } from './walletWhitelistService.js';

// Priority Tier Definitions
export const PRIORITY_TIERS = {
  PLATINUM: {
    tier_id: 'tier_platinum',
    name: 'Platinum',
    description: 'Highest priority tier for VIP investors',
    priority_level: 1,
    weight_multiplier: 3.0,
    guaranteed_slots: 0,
    eligibility_criteria: {
      min_investment: 1000000,
      kyc_required: true,
      whitelist_required: true
    }
  },
  GOLD: {
    tier_id: 'tier_gold',
    name: 'Gold',
    description: 'High priority tier for accredited investors',
    priority_level: 2,
    weight_multiplier: 2.0,
    guaranteed_slots: 0,
    eligibility_criteria: {
      min_investment: 100000,
      kyc_required: true,
      whitelist_required: true
    }
  },
  SILVER: {
    tier_id: 'tier_silver',
    name: 'Silver',
    description: 'Medium priority tier for verified investors',
    priority_level: 3,
    weight_multiplier: 1.5,
    guaranteed_slots: 0,
    eligibility_criteria: {
      min_investment: 10000,
      kyc_required: true,
      whitelist_required: false
    }
  },
  BRONZE: {
    tier_id: 'tier_bronze',
    name: 'Bronze',
    description: 'Standard priority tier for general investors',
    priority_level: 4,
    weight_multiplier: 1.0,
    guaranteed_slots: 0,
    eligibility_criteria: {
      min_investment: 1000,
      kyc_required: false,
      whitelist_required: false
    }
  },
  COMMUNITY: {
    tier_id: 'tier_community',
    name: 'Community',
    description: 'Base priority tier for community members',
    priority_level: 5,
    weight_multiplier: 0.5,
    guaranteed_slots: 0,
    eligibility_criteria: {
      min_investment: 100,
      kyc_required: false,
      whitelist_required: false
    }
  }
};

// Allocation Algorithms
export const ALLOCATION_ALGORITHMS = {
  FIFO: 'FIFO',
  WEIGHTED: 'WEIGHTED',
  LOTTERY: 'LOTTERY',
  HYBRID: 'HYBRID'
};

// Queue Entry Status
export const QUEUE_ENTRY_STATUS = {
  PENDING: 'PENDING',
  ALLOCATED: 'ALLOCATED',
  PARTIALLY_ALLOCATED: 'PARTIALLY_ALLOCATED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN'
};

// Event Types for logging
export const QUEUE_EVENT_TYPES = {
  QUEUE_CREATED: 'QUEUE_CREATED',
  QUEUE_OPENED: 'QUEUE_OPENED',
  QUEUE_CLOSED: 'QUEUE_CLOSED',
  USER_JOINED: 'USER_JOINED',
  USER_LEFT: 'USER_LEFT',
  POSITION_CHANGED: 'POSITION_CHANGED',
  ALLOCATION_STARTED: 'ALLOCATION_STARTED',
  ALLOCATION_COMPLETED: 'ALLOCATION_COMPLETED',
  ALLOCATION_FAILED: 'ALLOCATION_FAILED',
  TIER_ASSIGNED: 'TIER_ASSIGNED',
  PRIORITY_ADJUSTED: 'PRIORITY_ADJUSTED',
  GOVERNANCE_UPDATED: 'GOVERNANCE_UPDATED'
};

class PriorityQueueService {
  constructor() {
    this.db = null;
  }

  async getDatabase() {
    if (!this.db) {
      this.db = await getDatabase();
    }
    return this.db;
  }

  // === Queue Management ===

  /**
   * Create a new priority queue for an asset
   */
  async createQueue(queueData) {
    const db = await this.getDatabase();
    const {
      asset_contract_id,
      queue_name,
      description,
      allocation_algorithm = ALLOCATION_ALGORITHMS.FIFO,
      total_slots,
      opens_at,
      closes_at,
      tier_config,
      governance_rules
    } = queueData;

    const queue_id = `queue_${randomUUID().replace(/-/g, '')}`;

    const queue = {
      queue_id,
      asset_contract_id,
      queue_name,
      description,
      allocation_algorithm,
      total_slots,
      available_slots: total_slots,
      opens_at: opens_at ? new Date(opens_at) : null,
      closes_at: closes_at ? new Date(closes_at) : null,
      is_active: true,
      tier_config: tier_config || this.getDefaultTierConfig(),
      governance_rules: governance_rules || this.getDefaultGovernanceRules(),
      created_at: new Date(),
      updated_at: new Date()
    };

    await db('priority_queues').insert(queue);

    // Log event
    await this.logEvent(queue_id, null, null, QUEUE_EVENT_TYPES.QUEUE_CREATED, {
      asset_contract_id,
      allocation_algorithm,
      total_slots
    });

    return queue;
  }

  /**
   * Get queue by ID
   */
  async getQueue(queue_id) {
    const db = await this.getDatabase();
    const queue = await db('priority_queues').where({ queue_id }).first();
    return queue;
  }

  /**
   * Get queue by asset contract ID
   */
  async getQueueByAsset(asset_contract_id) {
    const db = await this.getDatabase();
    const queue = await db('priority_queues')
      .where({ asset_contract_id })
      .where('is_active', true)
      .first();
    return queue;
  }

  /**
   * Update queue
   */
  async updateQueue(queue_id, updates) {
    const db = await this.getDatabase();
    const queue = await this.getQueue(queue_id);
    
    if (!queue) {
      throw new Error('Queue not found');
    }

    const updatedQueue = {
      ...updates,
      updated_at: new Date()
    };

    await db('priority_queues').where({ queue_id }).update(updatedQueue);

    // Log governance updates
    if (updates.governance_rules) {
      await this.logEvent(queue_id, null, null, QUEUE_EVENT_TYPES.GOVERNANCE_UPDATED, {
        governance_rules: updates.governance_rules
      });
    }

    return { ...queue, ...updatedQueue };
  }

  /**
   * Open a queue for entries
   */
  async openQueue(queue_id) {
    const db = await this.getDatabase();
    await db('priority_queues').where({ queue_id }).update({
      is_active: true,
      updated_at: new Date()
    });

    await this.logEvent(queue_id, null, null, QUEUE_EVENT_TYPES.QUEUE_OPENED, {});
    return this.getQueue(queue_id);
  }

  /**
   * Close a queue for new entries
   */
  async closeQueue(queue_id) {
    const db = await this.getDatabase();
    await db('priority_queues').where({ queue_id }).update({
      is_active: false,
      updated_at: new Date()
    });

    await this.logEvent(queue_id, null, null, QUEUE_EVENT_TYPES.QUEUE_CLOSED, {});
    return this.getQueue(queue_id);
  }

  // === Queue Entry Management ===

  /**
   * Join a priority queue
   */
  async joinQueue(queue_id, user_wallet_address, requested_shares, metadata = {}) {
    const db = await this.getDatabase();
    const queue = await this.getQueue(queue_id);

    if (!queue) {
      throw new Error('Queue not found');
    }

    if (!queue.is_active) {
      throw new Error('Queue is not active');
    }

    if (queue.available_slots <= 0) {
      throw new Error('Queue has no available slots');
    }

    // Check if user already in queue
    const existingEntry = await db('queue_entries')
      .where({ queue_id, user_wallet_address })
      .where('status', QUEUE_ENTRY_STATUS.PENDING)
      .first();

    if (existingEntry) {
      throw new Error('User already in queue');
    }

    // Determine user's tier
    const tier = await this.determineUserTier(user_wallet_address, metadata, queue.tier_config);

    // Calculate queue position
    const currentPosition = await db('queue_entries')
      .where({ queue_id })
      .where('status', QUEUE_ENTRY_STATUS.PENDING)
      .max('queue_position as max_position')
      .first();

    const queue_position = (currentPosition?.max_position || 0) + 1;

    // Calculate initial priority score
    const priority_score = this.calculatePriorityScore(tier, queue_position, queue.allocation_algorithm);

    const entry_id = `entry_${randomUUID().replace(/-/g, '')}`;
    const entry = {
      entry_id,
      queue_id,
      user_wallet_address,
      tier_id: tier.tier_id,
      requested_shares,
      allocated_shares: 0,
      queue_position,
      status: QUEUE_ENTRY_STATUS.PENDING,
      priority_score,
      joined_at: new Date(),
      metadata,
      created_at: new Date(),
      updated_at: new Date()
    };

    await db('queue_entries').insert(entry);

    // Log event
    await this.logEvent(queue_id, entry_id, user_wallet_address, QUEUE_EVENT_TYPES.USER_JOINED, {
      tier_id: tier.tier_id,
      requested_shares,
      queue_position
    });

    // Log tier assignment
    await this.logEvent(queue_id, entry_id, user_wallet_address, QUEUE_EVENT_TYPES.TIER_ASSIGNED, {
      tier_id: tier.tier_id,
      tier_name: tier.name
    });

    return entry;
  }

  /**
   * Leave a priority queue
   */
  async leaveQueue(entry_id) {
    const db = await this.getDatabase();
    const entry = await db('queue_entries').where({ entry_id }).first();

    if (!entry) {
      throw new Error('Queue entry not found');
    }

    if (entry.status !== QUEUE_ENTRY_STATUS.PENDING) {
      throw new Error('Cannot leave queue - entry already processed');
    }

    await db('queue_entries').where({ entry_id }).update({
      status: QUEUE_ENTRY_STATUS.WITHDRAWN,
      updated_at: new Date()
    });

    // Rebalance queue positions
    await this.rebalanceQueuePositions(entry.queue_id);

    // Log event
    await this.logEvent(entry.queue_id, entry_id, entry.user_wallet_address, QUEUE_EVENT_TYPES.USER_LEFT, {
      previous_position: entry.queue_position
    });

    return { success: true, entry_id };
  }

  /**
   * Get user's queue position
   */
  async getQueuePosition(entry_id) {
    const db = await this.getDatabase();
    const entry = await db('queue_entries').where({ entry_id }).first();

    if (!entry) {
      throw new Error('Queue entry not found');
    }

    // Get current position (may have changed due to withdrawals)
    const currentPosition = await db('queue_entries')
      .where({ queue_id: entry.queue_id })
      .where('status', QUEUE_ENTRY_STATUS.PENDING)
      .where('queue_position', '<', entry.queue_position)
      .count('* as count')
      .first();

    const position = (currentPosition?.count || 0) + 1;

    return {
      entry_id,
      queue_id: entry.queue_id,
      user_wallet_address: entry.user_wallet_address,
      current_position: position,
      requested_shares: entry.requested_shares,
      allocated_shares: entry.allocated_shares,
      status: entry.status,
      tier_id: entry.tier_id,
      priority_score: entry.priority_score
    };
  }

  /**
   * Rebalance queue positions after withdrawals
   */
  async rebalanceQueuePositions(queue_id) {
    const db = await this.getDatabase();
    const entries = await db('queue_entries')
      .where({ queue_id })
      .where('status', QUEUE_ENTRY_STATUS.PENDING)
      .orderBy('priority_score', 'asc')
      .orderBy('joined_at', 'asc');

    for (let i = 0; i < entries.length; i++) {
      const newPosition = i + 1;
      if (entries[i].queue_position !== newPosition) {
        await db('queue_entries')
          .where({ entry_id: entries[i].entry_id })
          .update({
            queue_position: newPosition,
            updated_at: new Date()
          });

        await this.logEvent(queue_id, entries[i].entry_id, entries[i].user_wallet_address, 
          QUEUE_EVENT_TYPES.POSITION_CHANGED, {
          old_position: entries[i].queue_position,
          new_position: newPosition
        });
      }
    }
  }

  // === Allocation Algorithms ===

  /**
   * Run allocation process for a queue
   */
  async runAllocation(queue_id) {
    const db = await this.getDatabase();
    const queue = await this.getQueue(queue_id);

    if (!queue) {
      throw new Error('Queue not found');
    }

    await this.logEvent(queue_id, null, null, QUEUE_EVENT_TYPES.ALLOCATION_STARTED, {
      algorithm: queue.allocation_algorithm,
      available_slots: queue.available_slots
    });

    try {
      let allocations;

      switch (queue.allocation_algorithm) {
        case ALLOCATION_ALGORITHMS.FIFO:
          allocations = await this.allocateFIFO(queue);
          break;
        case ALLOCATION_ALGORITHMS.WEIGHTED:
          allocations = await this.allocateWeighted(queue);
          break;
        case ALLOCATION_ALGORITHMS.LOTTERY:
          allocations = await this.allocateLottery(queue);
          break;
        case ALLOCATION_ALGORITHMS.HYBRID:
          allocations = await this.allocateHybrid(queue);
          break;
        default:
          throw new Error(`Unknown allocation algorithm: ${queue.allocation_algorithm}`);
      }

      await this.logEvent(queue_id, null, null, QUEUE_EVENT_TYPES.ALLOCATION_COMPLETED, {
        algorithm: queue.allocation_algorithm,
        total_allocations: allocations.length,
        remaining_slots: queue.available_slots
      });

      return allocations;
    } catch (error) {
      await this.logEvent(queue_id, null, null, QUEUE_EVENT_TYPES.ALLOCATION_FAILED, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * FIFO Allocation - First In First Out
   */
  async allocateFIFO(queue) {
    const db = await this.getDatabase();
    const allocations = [];

    const entries = await db('queue_entries')
      .where({ queue_id: queue.queue_id })
      .where('status', QUEUE_ENTRY_STATUS.PENDING)
      .orderBy('queue_position', 'asc');

    let remainingSlots = queue.available_slots;

    for (const entry of entries) {
      if (remainingSlots <= 0) break;

      const sharesToAllocate = Math.min(entry.requested_shares, remainingSlots);

      await db('queue_entries').where({ entry_id: entry.entry_id }).update({
        allocated_shares: sharesToAllocate,
        status: sharesToAllocate === entry.requested_shares 
          ? QUEUE_ENTRY_STATUS.ALLOCATED 
          : QUEUE_ENTRY_STATUS.PARTIALLY_ALLOCATED,
        allocated_at: new Date(),
        updated_at: new Date()
      });

      await db('priority_queues').where({ queue_id: queue.queue_id }).update({
        available_slots: remainingSlots - sharesToAllocate,
        updated_at: new Date()
      });

      remainingSlots -= sharesToAllocate;

      allocations.push({
        entry_id: entry.entry_id,
        user_wallet_address: entry.user_wallet_address,
        allocated_shares: sharesToAllocate,
        requested_shares: entry.requested_shares
      });

      // Send notification
      await this.sendAllocationNotification(entry.entry_id, queue.queue_id, 
        entry.user_wallet_address, sharesToAllocate);
    }

    return allocations;
  }

  /**
   * Weighted Allocation - Based on tier weights
   */
  async allocateWeighted(queue) {
    const db = await this.getDatabase();
    const allocations = [];

    const entries = await db('queue_entries')
      .where({ queue_id: queue.queue_id })
      .where('status', QUEUE_ENTRY_STATUS.PENDING)
      .orderBy('priority_score', 'desc');

    let remainingSlots = queue.available_slots;
    const totalWeight = entries.reduce((sum, e) => sum + e.priority_score, 0);

    for (const entry of entries) {
      if (remainingSlots <= 0) break;

      const weightRatio = entry.priority_score / totalWeight;
      const maxAllocation = Math.floor(queue.available_slots * weightRatio);
      const sharesToAllocate = Math.min(entry.requested_shares, maxAllocation, remainingSlots);

      if (sharesToAllocate > 0) {
        await db('queue_entries').where({ entry_id: entry.entry_id }).update({
          allocated_shares: sharesToAllocate,
          status: sharesToAllocate === entry.requested_shares 
            ? QUEUE_ENTRY_STATUS.ALLOCATED 
            : QUEUE_ENTRY_STATUS.PARTIALLY_ALLOCATED,
          allocated_at: new Date(),
          updated_at: new Date()
        });

        remainingSlots -= sharesToAllocate;

        allocations.push({
          entry_id: entry.entry_id,
          user_wallet_address: entry.user_wallet_address,
          allocated_shares: sharesToAllocate,
          requested_shares: entry.requested_shares,
          weight: entry.priority_score
        });

        await this.sendAllocationNotification(entry.entry_id, queue.queue_id, 
          entry.user_wallet_address, sharesToAllocate);
      }
    }

    await db('priority_queues').where({ queue_id: queue.queue_id }).update({
      available_slots: remainingSlots,
      updated_at: new Date()
    });

    return allocations;
  }

  /**
   * Lottery Allocation - Random selection weighted by priority
   */
  async allocateLottery(queue) {
    const db = await this.getDatabase();
    const allocations = [];

    const entries = await db('queue_entries')
      .where({ queue_id: queue.queue_id })
      .where('status', QUEUE_ENTRY_STATUS.PENDING);

    let remainingSlots = queue.available_slots;
    const selectedEntries = new Set();

    while (remainingSlots > 0 && selectedEntries.size < entries.length) {
      // Weighted random selection
      const totalWeight = entries
        .filter(e => !selectedEntries.has(e.entry_id))
        .reduce((sum, e) => sum + e.priority_score, 0);

      let randomWeight = Math.random() * totalWeight;
      let selectedEntry = null;

      for (const entry of entries) {
        if (selectedEntries.has(entry.entry_id)) continue;
        
        randomWeight -= entry.priority_score;
        if (randomWeight <= 0) {
          selectedEntry = entry;
          break;
        }
      }

      if (!selectedEntry) {
        selectedEntry = entries.find(e => !selectedEntries.has(e.entry_id));
      }

      if (selectedEntry) {
        selectedEntries.add(selectedEntry.entry_id);
        const sharesToAllocate = Math.min(selectedEntry.requested_shares, remainingSlots);

        await db('queue_entries').where({ entry_id: selectedEntry.entry_id }).update({
          allocated_shares: sharesToAllocate,
          status: sharesToAllocate === selectedEntry.requested_shares 
            ? QUEUE_ENTRY_STATUS.ALLOCATED 
            : QUEUE_ENTRY_STATUS.PARTIALLY_ALLOCATED,
          allocated_at: new Date(),
          updated_at: new Date()
        });

        remainingSlots -= sharesToAllocate;

        allocations.push({
          entry_id: selectedEntry.entry_id,
          user_wallet_address: selectedEntry.user_wallet_address,
          allocated_shares: sharesToAllocate,
          requested_shares: selectedEntry.requested_shares
        });

        await this.sendAllocationNotification(selectedEntry.entry_id, queue.queue_id, 
          selectedEntry.user_wallet_address, sharesToAllocate);
      }
    }

    await db('priority_queues').where({ queue_id: queue.queue_id }).update({
      available_slots: remainingSlots,
      updated_at: new Date()
    });

    return allocations;
  }

  /**
   * Hybrid Allocation - Combines guaranteed slots with weighted allocation
   */
  async allocateHybrid(queue) {
    const db = await this.getDatabase();
    const allocations = [];

    // First, allocate guaranteed slots by tier
    const tierConfig = queue.tier_config || {};
    let remainingSlots = queue.available_slots;

    for (const [tierName, tierInfo] of Object.entries(PRIORITY_TIERS)) {
      const guaranteedSlots = tierConfig[tierName]?.guaranteed_slots || tierInfo.guaranteed_slots;
      
      if (guaranteedSlots > 0) {
        const tierEntries = await db('queue_entries')
          .where({ queue_id: queue.queue_id, tier_id: tierInfo.tier_id })
          .where('status', QUEUE_ENTRY_STATUS.PENDING)
          .orderBy('queue_position', 'asc')
          .limit(guaranteedSlots);

        for (const entry of tierEntries) {
          if (remainingSlots <= 0) break;

          const sharesToAllocate = Math.min(entry.requested_shares, remainingSlots);

          await db('queue_entries').where({ entry_id: entry.entry_id }).update({
            allocated_shares: sharesToAllocate,
            status: sharesToAllocate === entry.requested_shares 
              ? QUEUE_ENTRY_STATUS.ALLOCATED 
              : QUEUE_ENTRY_STATUS.PARTIALLY_ALLOCATED,
            allocated_at: new Date(),
            updated_at: new Date()
          });

          remainingSlots -= sharesToAllocate;

          allocations.push({
            entry_id: entry.entry_id,
            user_wallet_address: entry.user_wallet_address,
            allocated_shares: sharesToAllocate,
            requested_shares: entry.requested_shares,
            allocation_type: 'guaranteed'
          });

          await this.sendAllocationNotification(entry.entry_id, queue.queue_id, 
            entry.user_wallet_address, sharesToAllocate);
        }
      }
    }

    // Then, allocate remaining slots using weighted algorithm
    if (remainingSlots > 0) {
      const remainingAllocations = await this.allocateWeighted({
        ...queue,
        available_slots: remainingSlots
      });
      allocations.push(...remainingAllocations);
    }

    return allocations;
  }

  // === Priority Score Calculation ===

  /**
   * Calculate priority score for an entry
   */
  calculatePriorityScore(tier, queue_position, algorithm) {
    const baseScore = 1000 - (tier.priority_level * 100);
    
    switch (algorithm) {
      case ALLOCATION_ALGORITHMS.FIFO:
        // FIFO uses position primarily
        return baseScore - (queue_position * 0.1);
      
      case ALLOCATION_ALGORITHMS.WEIGHTED:
        // Weighted uses tier multiplier
        return baseScore * tier.weight_multiplier;
      
      case ALLOCATION_ALGORITHMS.LOTTERY:
        // Lottery uses tier weight for probability
        return tier.weight_multiplier * 100;
      
      case ALLOCATION_ALGORITHMS.HYBRID:
        // Hybrid combines tier weight with position
        return (baseScore * tier.weight_multiplier) - (queue_position * 0.05);
      
      default:
        return baseScore;
    }
  }

  /**
   * Determine user's tier based on eligibility criteria
   */
  async determineUserTier(user_wallet_address, metadata, tier_config) {
    // Check whitelist service first
    const whitelistStatus = await walletWhitelistService.getWalletStatus(user_wallet_address);
    
    // If blacklisted, throw error
    if (whitelistStatus.blacklisted) {
      throw new Error('Wallet is blacklisted and cannot join queue');
    }

    // Use whitelist tier if available
    if (whitelistStatus.whitelisted && whitelistStatus.tier_id) {
      const whitelistedTier = Object.values(PRIORITY_TIERS).find(t => t.tier_id === whitelistStatus.tier_id);
      if (whitelistedTier) {
        return whitelistedTier;
      }
    }

    // Otherwise, determine tier based on investment history, KYC status, etc.
    const investment_amount = metadata.investment_amount || 0;
    const is_kyc_verified = metadata.kyc_verified || false;
    const is_whitelisted = whitelistStatus.whitelisted;

    // Check tiers from highest to lowest
    if (investment_amount >= 1000000 && is_kyc_verified && is_whitelisted) {
      return PRIORITY_TIERS.PLATINUM;
    }
    if (investment_amount >= 100000 && is_kyc_verified && is_whitelisted) {
      return PRIORITY_TIERS.GOLD;
    }
    if (investment_amount >= 10000 && is_kyc_verified) {
      return PRIORITY_TIERS.SILVER;
    }
    if (investment_amount >= 1000) {
      return PRIORITY_TIERS.BRONZE;
    }
    
    return PRIORITY_TIERS.COMMUNITY;
  }

  /**
   * Dynamically adjust priority scores
   */
  async adjustPriorityScores(queue_id, adjustment_factors) {
    const db = await this.getDatabase();
    const entries = await db('queue_entries')
      .where({ queue_id })
      .where('status', QUEUE_ENTRY_STATUS.PENDING);

    for (const entry of entries) {
      const tier = Object.values(PRIORITY_TIERS).find(t => t.tier_id === entry.tier_id);
      if (!tier) continue;

      const oldScore = entry.priority_score;
      const newScore = this.calculateAdjustedScore(oldScore, adjustment_factors, entry, tier);

      if (newScore !== oldScore) {
        await db('queue_entries').where({ entry_id: entry.entry_id }).update({
          priority_score: newScore,
          updated_at: new Date()
        });

        await this.logEvent(queue_id, entry.entry_id, entry.user_wallet_address, 
          QUEUE_EVENT_TYPES.PRIORITY_ADJUSTED, {
          old_score: oldScore,
          new_score: newScore,
          adjustment_factors
        });
      }
    }

    // Rebalance positions after score adjustment
    await this.rebalanceQueuePositions(queue_id);
  }

  /**
   * Calculate adjusted priority score
   */
  calculateAdjustedScore(baseScore, factors, entry, tier) {
    let adjustedScore = baseScore;

    // Time-based adjustment (longer wait = higher priority)
    if (factors.time_weight) {
      const waitTime = Date.now() - new Date(entry.joined_at).getTime();
      const timeBonus = Math.floor(waitTime / (1000 * 60 * 60)) * factors.time_weight; // per hour
      adjustedScore += timeBonus;
    }

    // Investment amount adjustment
    if (factors.investment_weight && entry.metadata?.investment_amount) {
      const investmentBonus = Math.log10(entry.metadata.investment_amount) * factors.investment_weight;
      adjustedScore += investmentBonus;
    }

    // Loyalty adjustment (based on historical allocations)
    if (factors.loyalty_weight && entry.metadata?.historical_allocations) {
      const loyaltyBonus = entry.metadata.historical_allocations * factors.loyalty_weight;
      adjustedScore += loyaltyBonus;
    }

    return Math.max(0, adjustedScore);
  }

  // === Event Logging ===

  /**
   * Log a queue event
   */
  async logEvent(queue_id, entry_id, user_wallet_address, event_type, event_data, notes = null) {
    const db = await this.getDatabase();
    const event_id = `event_${randomUUID().replace(/-/g, '')}`;

    await db('queue_events').insert({
      event_id,
      queue_id,
      entry_id,
      user_wallet_address,
      event_type,
      event_data,
      notes,
      created_at: new Date()
    });
  }

  /**
   * Get events for a queue
   */
  async getQueueEvents(queue_id, limit = 100) {
    const db = await this.getDatabase();
    const events = await db('queue_events')
      .where({ queue_id })
      .orderBy('created_at', 'desc')
      .limit(limit);

    return events;
  }

  // === Analytics ===

  /**
   * Generate daily analytics snapshot
   */
  async generateAnalyticsSnapshot(queue_id) {
    const db = await this.getDatabase();
    const queue = await this.getQueue(queue_id);
    if (!queue) throw new Error('Queue not found');

    const snapshot_date = new Date().toISOString().split('T')[0];

    // Get current statistics
    const totalEntries = await db('queue_entries')
      .where({ queue_id })
      .count('* as count')
      .first();

    const entriesByTier = await db('queue_entries')
      .where({ queue_id })
      .select('tier_id')
      .count('* as count')
      .groupBy('tier_id');

    const totalRequestedShares = await db('queue_entries')
      .where({ queue_id })
      .sum('requested_shares as total')
      .first();

    const totalAllocatedShares = await db('queue_entries')
      .where({ queue_id })
      .where('status', QUEUE_ENTRY_STATUS.ALLOCATED)
      .sum('allocated_shares as total')
      .first();

    const withdrawals = await db('queue_entries')
      .where({ queue_id })
      .where('status', QUEUE_ENTRY_STATUS.WITHDRAWN)
      .count('* as count')
      .first();

    const tierAllocationStats = {};
    for (const entry of entriesByTier) {
      const tierAllocations = await db('queue_entries')
        .where({ queue_id, tier_id: entry.tier_id })
        .where('status', QUEUE_ENTRY_STATUS.ALLOCATED)
        .sum('allocated_shares as total')
        .first();

      tierAllocationStats[entry.tier_id] = {
        entries: entry.count,
        allocated_shares: tierAllocations?.total || 0
      };
    }

    const allocationRate = totalRequestedShares.total > 0
      ? (totalAllocatedShares.total / totalRequestedShares.total) * 100
      : 0;

    const analytics_id = `analytics_${randomUUID().replace(/-/g, '')}`;

    await db('queue_analytics').insert({
      analytics_id,
      queue_id,
      snapshot_date,
      total_entries: totalEntries.count || 0,
      entries_by_tier: JSON.stringify(entriesByTier.reduce((acc, e) => {
        acc[e.tier_id] = e.count;
        return acc;
      }, {})),
      total_requested_shares: totalRequestedShares.total || 0,
      total_allocated_shares: totalAllocatedShares.total || 0,
      allocation_rate: allocationRate.toFixed(2),
      withdrawals: withdrawals.count || 0,
      tier_allocation_stats: JSON.stringify(tierAllocationStats),
      created_at: new Date(),
      updated_at: new Date()
    });

    return this.getAnalytics(queue_id, snapshot_date);
  }

  /**
   * Get analytics for a queue
   */
  async getAnalytics(queue_id, snapshot_date = null) {
    const db = await this.getDatabase();
    
    let query = db('queue_analytics').where({ queue_id });
    if (snapshot_date) {
      query = query.where({ snapshot_date });
    }
    
    const analytics = await query.orderBy('snapshot_date', 'desc').first();
    
    if (analytics) {
      analytics.entries_by_tier = JSON.parse(analytics.entries_by_tier || '{}');
      analytics.tier_allocation_stats = JSON.parse(analytics.tier_allocation_stats || '{}');
    }
    
    return analytics;
  }

  // === Governance ===

  /**
   * Add governance rule to queue
   */
  async addGovernanceRule(queue_id, rule) {
    const db = await this.getDatabase();
    const governance_id = `gov_${randomUUID().replace(/-/g, '')}`;

    await db('queue_governance').insert({
      governance_id,
      queue_id,
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      rule_config: rule.rule_config,
      is_active: rule.is_active !== false,
      effective_from: rule.effective_from || new Date(),
      effective_until: rule.effective_until || null,
      created_at: new Date(),
      updated_at: new Date()
    });

    await this.logEvent(queue_id, null, null, QUEUE_EVENT_TYPES.GOVERNANCE_UPDATED, {
      rule_name: rule.rule_name,
      rule_type: rule.rule_type
    });

    return this.getGovernanceRule(governance_id);
  }

  /**
   * Get governance rule
   */
  async getGovernanceRule(governance_id) {
    const db = await this.getDatabase();
    return db('queue_governance').where({ governance_id }).first();
  }

  /**
   * Get active governance rules for queue
   */
  async getActiveGovernanceRules(queue_id) {
    const db = await this.getDatabase();
    const now = new Date();

    return db('queue_governance')
      .where({ queue_id, is_active: true })
      .where('effective_from', '<=', now)
      .where(function() {
        this.whereNull('effective_until').orWhere('effective_until', '>', now);
      });
  }

  /**
   * Check if entry complies with governance rules
   */
  async checkGovernanceCompliance(entry_id) {
    const db = await this.getDatabase();
    const entry = await db('queue_entries').where({ entry_id }).first();
    
    if (!entry) {
      throw new Error('Entry not found');
    }

    const rules = await this.getActiveGovernanceRules(entry.queue_id);
    const compliance = { compliant: true, violations: [] };

    for (const rule of rules) {
      const config = rule.rule_config;

      switch (rule.rule_type) {
        case 'ALLOCATION_CAP':
          if (entry.requested_shares > config.max_shares) {
            compliance.compliant = false;
            compliance.violations.push({
              rule: rule.rule_name,
              reason: `Requested shares ${entry.requested_shares} exceeds cap ${config.max_shares}`
            });
          }
          break;

        case 'WHITELIST_ONLY':
          if (!entry.metadata?.whitelisted) {
            compliance.compliant = false;
            compliance.violations.push({
              rule: rule.rule_name,
              reason: 'User not whitelisted'
            });
          }
          break;

        case 'KYC_REQUIRED':
          if (!entry.metadata?.kyc_verified) {
            compliance.compliant = false;
            compliance.violations.push({
              rule: rule.rule_name,
              reason: 'KYC not verified'
            });
          }
          break;

        case 'TIME_WINDOW':
          const now = new Date();
          const windowStart = new Date(config.start_time);
          const windowEnd = new Date(config.end_time);
          if (now < windowStart || now > windowEnd) {
            compliance.compliant = false;
            compliance.violations.push({
              rule: rule.rule_name,
              reason: 'Outside allowed time window'
            });
          }
          break;
      }
    }

    return compliance;
  }

  // === Notifications ===

  /**
   * Send allocation notification
   */
  async sendAllocationNotification(entry_id, queue_id, user_wallet_address, allocated_shares) {
    const db = await this.getDatabase();
    const notification_id = `notif_${randomUUID().replace(/-/g, '')}`;

    await db('allocation_notifications').insert({
      notification_id,
      entry_id,
      queue_id,
      user_wallet_address,
      notification_type: 'ALLOCATION_OFFER',
      notification_data: {
        allocated_shares,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      },
      status: 'PENDING',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      created_at: new Date(),
      updated_at: new Date()
    });

    return notification_id;
  }

  /**
   * Get pending notifications for user
   */
  async getPendingNotifications(user_wallet_address) {
    const db = await this.getDatabase();
    return db('allocation_notifications')
      .where({ user_wallet_address, status: 'PENDING' })
      .where('expires_at', '>', new Date());
  }

  // === Default Configurations ===

  getDefaultTierConfig() {
    return {
      [PRIORITY_TIERS.PLATINUM.tier_id]: {
        guaranteed_slots: 5,
        enabled: true
      },
      [PRIORITY_TIERS.GOLD.tier_id]: {
        guaranteed_slots: 10,
        enabled: true
      },
      [PRIORITY_TIERS.SILVER.tier_id]: {
        guaranteed_slots: 0,
        enabled: true
      },
      [PRIORITY_TIERS.BRONZE.tier_id]: {
        guaranteed_slots: 0,
        enabled: true
      },
      [PRIORITY_TIERS.COMMUNITY.tier_id]: {
        guaranteed_slots: 0,
        enabled: true
      }
    };
  }

  getDefaultGovernanceRules() {
    return {
      require_kyc: true,
      require_whitelist: false,
      max_shares_per_user: null,
      time_window_enabled: false
    };
  }
}

// Export singleton instance
export const priorityQueueService = new PriorityQueueService();
