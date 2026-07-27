// Priority Queue Service - Federated Resolvers
// This file contains the resolver functions for the Priority Queue service

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { gql } from 'graphql-tag';
import { 
  priorityQueueService, 
  PRIORITY_TIERS, 
  ALLOCATION_ALGORITHMS,
  QUEUE_ENTRY_STATUS 
} from '../../src/services/priorityQueueService.js';
import { walletWhitelistService } from '../../src/services/walletWhitelistService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the schema
const schemaPath = join(__dirname, 'schema.graphql');
const typeDefs = gql(readFileSync(schemaPath, 'utf-8'));

// Initialize whitelist service
await walletWhitelistService.initialize();

// Resolvers
export const resolvers = {
  PriorityQueue: {
    // Reference resolver for queue entries
    entries: async (queue, _args, context) => {
      const db = await priorityQueueService.getDatabase();
      const entries = await db('queue_entries')
        .where({ queue_id: queue.queueId })
        .limit(_args.limit || 50)
        .offset(_args.offset || 0);
      
      return entries.map(entry => ({
        entryId: entry.entry_id,
        queueId: entry.queue_id,
        userWalletAddress: entry.user_wallet_address,
        tierId: entry.tier_id,
        requestedShares: entry.requested_shares,
        allocatedShares: entry.allocated_shares,
        queuePosition: entry.queue_position,
        status: entry.status,
        priorityScore: entry.priority_score,
        joinedAt: entry.joined_at,
        allocatedAt: entry.allocated_at,
        metadata: entry.metadata,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at
      }));
    },
    
    // Reference resolver for queue events
    events: async (queue, _args, context) => {
      const events = await priorityQueueService.getQueueEvents(queue.queueId, _args.limit || 100);
      
      return events.map(event => ({
        eventId: event.event_id,
        queueId: event.queue_id,
        entryId: event.entry_id,
        userWalletAddress: event.user_wallet_address,
        eventType: event.event_type,
        eventData: event.event_data,
        notes: event.notes,
        createdAt: event.created_at
      }));
    },
    
    // Reference resolver for analytics
    analytics: async (queue, _args, context) => {
      const analytics = await priorityQueueService.getAnalytics(queue.queueId);
      
      if (!analytics) return null;
      
      return {
        analyticsId: analytics.analytics_id,
        queueId: analytics.queue_id,
        snapshotDate: analytics.snapshot_date,
        totalEntries: analytics.total_entries,
        entriesByTier: analytics.entries_by_tier,
        avgQueueTimeSeconds: analytics.avg_queue_time_seconds,
        totalRequestedShares: analytics.total_requested_shares,
        totalAllocatedShares: analytics.total_allocated_shares,
        allocationRate: parseFloat(allocation.allocation_rate),
        withdrawals: analytics.withdrawals,
        tierAllocationStats: analytics.tier_allocation_stats,
        createdAt: analytics.created_at,
        updatedAt: analytics.updated_at
      };
    }
  },
  
  QueueEntry: {
    // Reference resolver for queue
    queue: async (entry, _args, context) => {
      const queue = await priorityQueueService.getQueue(entry.queueId);
      
      if (!queue) return null;
      
      return {
        queueId: queue.queue_id,
        assetContractId: queue.asset_contract_id,
        queueName: queue.queue_name,
        description: queue.description,
        allocationAlgorithm: queue.allocation_algorithm,
        totalSlots: queue.total_slots,
        availableSlots: queue.available_slots,
        opensAt: queue.opens_at,
        closesAt: queue.closes_at,
        isActive: queue.is_active,
        tierConfig: queue.tier_config,
        governanceRules: queue.governance_rules,
        createdAt: queue.created_at,
        updatedAt: queue.updated_at
      };
    }
  },
  
  Query: {
    // Queue queries
    queue: async (_parent, args) => {
      const queue = await priorityQueueService.getQueue(args.queueId);
      
      if (!queue) return null;
      
      return {
        queueId: queue.queue_id,
        assetContractId: queue.asset_contract_id,
        queueName: queue.queue_name,
        description: queue.description,
        allocationAlgorithm: queue.allocation_algorithm,
        totalSlots: queue.total_slots,
        availableSlots: queue.available_slots,
        opensAt: queue.opens_at,
        closesAt: queue.closes_at,
        isActive: queue.is_active,
        tierConfig: queue.tier_config,
        governanceRules: queue.governance_rules,
        createdAt: queue.created_at,
        updatedAt: queue.updated_at
      };
    },
    
    queueByAsset: async (_parent, args) => {
      const queue = await priorityQueueService.getQueueByAsset(args.assetContractId);
      
      if (!queue) return null;
      
      return {
        queueId: queue.queue_id,
        assetContractId: queue.asset_contract_id,
        queueName: queue.queue_name,
        description: queue.description,
        allocationAlgorithm: queue.allocation_algorithm,
        totalSlots: queue.total_slots,
        availableSlots: queue.available_slots,
        opensAt: queue.opens_at,
        closesAt: queue.closes_at,
        isActive: queue.is_active,
        tierConfig: queue.tier_config,
        governanceRules: queue.governance_rules,
        createdAt: queue.created_at,
        updatedAt: queue.updated_at
      };
    },
    
    queues: async (_parent, args) => {
      const db = await priorityQueueService.getDatabase();
      const { limit = 50, offset = 0 } = args;
      
      const queues = await db('priority_queues')
        .limit(limit)
        .offset(offset)
        .orderBy('created_at', 'desc');
      
      return queues.map(queue => ({
        queueId: queue.queue_id,
        assetContractId: queue.asset_contract_id,
        queueName: queue.queue_name,
        description: queue.description,
        allocationAlgorithm: queue.allocation_algorithm,
        totalSlots: queue.total_slots,
        availableSlots: queue.available_slots,
        opensAt: queue.opens_at,
        closesAt: queue.closes_at,
        isActive: queue.is_active,
        tierConfig: queue.tier_config,
        governanceRules: queue.governance_rules,
        createdAt: queue.created_at,
        updatedAt: queue.updated_at
      }));
    },
    
    // Entry queries
    queueEntry: async (_parent, args) => {
      const db = await priorityQueueService.getDatabase();
      const entry = await db('queue_entries').where({ entry_id: args.entryId }).first();
      
      if (!entry) return null;
      
      return {
        entryId: entry.entry_id,
        queueId: entry.queue_id,
        userWalletAddress: entry.user_wallet_address,
        tierId: entry.tier_id,
        requestedShares: entry.requested_shares,
        allocatedShares: entry.allocated_shares,
        queuePosition: entry.queue_position,
        status: entry.status,
        priorityScore: entry.priority_score,
        joinedAt: entry.joined_at,
        allocatedAt: entry.allocated_at,
        metadata: entry.metadata,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at
      };
    },
    
    queueEntries: async (_parent, args) => {
      const db = await priorityQueueService.getDatabase();
      const { queueId, status, limit = 50, offset = 0 } = args;
      
      let query = db('queue_entries').where({ queue_id: queueId });
      
      if (status) {
        query = query.where({ status });
      }
      
      const entries = await query
        .limit(limit)
        .offset(offset)
        .orderBy('queue_position', 'asc');
      
      return entries.map(entry => ({
        entryId: entry.entry_id,
        queueId: entry.queue_id,
        userWalletAddress: entry.user_wallet_address,
        tierId: entry.tier_id,
        requestedShares: entry.requested_shares,
        allocatedShares: entry.allocated_shares,
        queuePosition: entry.queue_position,
        status: entry.status,
        priorityScore: entry.priority_score,
        joinedAt: entry.joined_at,
        allocatedAt: entry.allocated_at,
        metadata: entry.metadata,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at
      }));
    },
    
    // Event queries
    queueEvents: async (_parent, args) => {
      const events = await priorityQueueService.getQueueEvents(args.queueId, args.limit || 100);
      
      return events.map(event => ({
        eventId: event.event_id,
        queueId: event.queue_id,
        entryId: event.entry_id,
        userWalletAddress: event.user_wallet_address,
        eventType: event.event_type,
        eventData: event.event_data,
        notes: event.notes,
        createdAt: event.created_at
      }));
    },
    
    // Analytics queries
    queueAnalytics: async (_parent, args) => {
      const analytics = await priorityQueueService.getAnalytics(args.queueId, args.snapshotDate);
      
      if (!analytics) return null;
      
      return {
        analyticsId: analytics.analytics_id,
        queueId: analytics.queue_id,
        snapshotDate: analytics.snapshot_date,
        totalEntries: analytics.total_entries,
        entriesByTier: analytics.entries_by_tier,
        avgQueueTimeSeconds: analytics.avg_queue_time_seconds,
        totalRequestedShares: analytics.total_requested_shares,
        totalAllocatedShares: analytics.total_allocated_shares,
        allocationRate: parseFloat(allocation.allocation_rate),
        withdrawals: analytics.withdrawals,
        tierAllocationStats: analytics.tier_allocation_stats,
        createdAt: analytics.created_at,
        updatedAt: analytics.updated_at
      };
    },
    
    // Governance queries
    governanceRules: async (_parent, args) => {
      const rules = await priorityQueueService.getActiveGovernanceRules(args.queueId);
      
      return rules.map(rule => ({
        governanceId: rule.governance_id,
        queueId: rule.queue_id,
        ruleName: rule.rule_name,
        ruleType: rule.rule_type,
        ruleConfig: rule.rule_config,
        isActive: rule.is_active,
        effectiveFrom: rule.effective_from,
        effectiveUntil: rule.effective_until,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at
      }));
    },
    
    queueCompliance: async (_parent, args) => {
      const compliance = await priorityQueueService.checkGovernanceCompliance(args.entryId);
      
      return {
        compliant: compliance.compliant,
        violations: compliance.violations
      };
    },
    
    // Notification queries
    pendingNotifications: async (_parent, args) => {
      const db = await priorityQueueService.getDatabase();
      const notifications = await db('allocation_notifications')
        .where({ user_wallet_address: args.userWalletAddress, status: 'PENDING' })
        .where('expires_at', '>', new Date());
      
      return notifications.map(notif => ({
        notificationId: notif.notification_id,
        entryId: notif.entry_id,
        queueId: notif.queue_id,
        userWalletAddress: notif.user_wallet_address,
        notificationType: notif.notification_type,
        notificationData: notif.notification_data,
        status: notif.status,
        retryCount: notif.retry_count,
        expiresAt: notif.expires_at,
        sentAt: notif.sent_at,
        createdAt: notif.created_at,
        updatedAt: notif.updated_at
      }));
    },
    
    // Whitelist queries
    walletStatus: async (_parent, args) => {
      return walletWhitelistService.getWalletStatus(args.walletAddress);
    },
    
    whitelistDetails: async (_parent, args) => {
      const { limit = 100, offset = 0 } = args;
      return walletWhitelistService.getWhitelistDetails(limit, offset);
    },
    
    blacklistDetails: async (_parent, args) => {
      const { limit = 100, offset = 0 } = args;
      return walletWhitelistService.getBlacklistDetails(limit, offset);
    },
    
    whitelistStatistics: async (_parent, _args) => {
      return walletWhitelistService.getStatistics();
    },
    
    // Configuration queries
    priorityTiers: () => PRIORITY_TIERS,
    
    allocationAlgorithms: () => Object.values(ALLOCATION_ALGORITHMS)
  },
  
  Mutation: {
    // Queue mutations
    createQueue: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can create queues');
      }
      
      const queue = await priorityQueueService.createQueue(args.input);
      
      return {
        queueId: queue.queue_id,
        assetContractId: queue.asset_contract_id,
        queueName: queue.queue_name,
        description: queue.description,
        allocationAlgorithm: queue.allocation_algorithm,
        totalSlots: queue.total_slots,
        availableSlots: queue.available_slots,
        opensAt: queue.opens_at,
        closesAt: queue.closes_at,
        isActive: queue.is_active,
        tierConfig: queue.tier_config,
        governanceRules: queue.governance_rules,
        createdAt: queue.created_at,
        updatedAt: queue.updated_at
      };
    },
    
    updateQueue: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can update queues');
      }
      
      const queue = await priorityQueueService.updateQueue(args.queueId, args.input);
      
      return {
        queueId: queue.queue_id,
        assetContractId: queue.asset_contract_id,
        queueName: queue.queue_name,
        description: queue.description,
        allocationAlgorithm: queue.allocation_algorithm,
        totalSlots: queue.total_slots,
        availableSlots: queue.available_slots,
        opensAt: queue.opens_at,
        closesAt: queue.closes_at,
        isActive: queue.is_active,
        tierConfig: queue.tier_config,
        governanceRules: queue.governance_rules,
        createdAt: queue.created_at,
        updatedAt: queue.updated_at
      };
    },
    
    openQueue: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can open queues');
      }
      
      const queue = await priorityQueueService.openQueue(args.queueId);
      
      return {
        queueId: queue.queue_id,
        assetContractId: queue.asset_contract_id,
        queueName: queue.queue_name,
        description: queue.description,
        allocationAlgorithm: queue.allocation_algorithm,
        totalSlots: queue.total_slots,
        availableSlots: queue.available_slots,
        opensAt: queue.opens_at,
        closesAt: queue.closes_at,
        isActive: queue.is_active,
        tierConfig: queue.tier_config,
        governanceRules: queue.governance_rules,
        createdAt: queue.created_at,
        updatedAt: queue.updated_at
      };
    },
    
    closeQueue: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can close queues');
      }
      
      const queue = await priorityQueueService.closeQueue(args.queueId);
      
      return {
        queueId: queue.queue_id,
        assetContractId: queue.asset_contract_id,
        queueName: queue.queue_name,
        description: queue.description,
        allocationAlgorithm: queue.allocation_algorithm,
        totalSlots: queue.total_slots,
        availableSlots: queue.available_slots,
        opensAt: queue.opens_at,
        closesAt: queue.closes_at,
        isActive: queue.is_active,
        tierConfig: queue.tier_config,
        governanceRules: queue.governance_rules,
        createdAt: queue.created_at,
        updatedAt: queue.updated_at
      };
    },
    
    // Entry mutations
    joinQueue: async (_parent, args) => {
      const entry = await priorityQueueService.joinQueue(
        args.input.queueId,
        args.input.userWalletAddress,
        args.input.requestedShares,
        args.input.metadata
      );
      
      return {
        entryId: entry.entry_id,
        queueId: entry.queue_id,
        userWalletAddress: entry.user_wallet_address,
        tierId: entry.tier_id,
        requestedShares: entry.requested_shares,
        allocatedShares: entry.allocated_shares,
        queuePosition: entry.queue_position,
        status: entry.status,
        priorityScore: entry.priority_score,
        joinedAt: entry.joined_at,
        allocatedAt: entry.allocated_at,
        metadata: entry.metadata,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at
      };
    },
    
    leaveQueue: async (_parent, args) => {
      const result = await priorityQueueService.leaveQueue(args.entryId);
      
      return {
        success: result.success,
        entryId: result.entry_id
      };
    },
    
    // Allocation mutations
    runAllocation: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can run allocations');
      }
      
      const allocations = await priorityQueueService.runAllocation(args.queueId);
      
      return {
        allocations: allocations.map(alloc => ({
          entryId: alloc.entry_id,
          userWalletAddress: alloc.user_wallet_address,
          allocatedShares: alloc.allocated_shares,
          requestedShares: alloc.requested_shares,
          allocationType: alloc.allocation_type
        })),
        count: allocations.length
      };
    },
    
    adjustPriorityScores: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can adjust priority scores');
      }
      
      await priorityQueueService.adjustPriorityScores(args.queueId, args.input);
      
      return {
        success: true,
        message: 'Priority scores adjusted'
      };
    },
    
    // Analytics mutations
    generateAnalyticsSnapshot: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can generate analytics');
      }
      
      const analytics = await priorityQueueService.generateAnalyticsSnapshot(args.queueId);
      
      return {
        analyticsId: analytics.analytics_id,
        queueId: analytics.queue_id,
        snapshotDate: analytics.snapshot_date,
        totalEntries: analytics.total_entries,
        entriesByTier: analytics.entries_by_tier,
        avgQueueTimeSeconds: analytics.avg_queue_time_seconds,
        totalRequestedShares: analytics.total_requested_shares,
        totalAllocatedShares: analytics.total_allocated_shares,
        allocationRate: parseFloat(analytics.allocation_rate),
        withdrawals: analytics.totaldrawals,
        tierAllocationStats: analytics.tier_allocation_stats,
        createdAt: analytics.created_at,
        updatedAt: analytics.updated_at
      };
    },
    
    // Governance mutations
    addGovernanceRule: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can add governance rules');
      }
      
      const rule = await priorityQueueService.addGovernanceRule(args.input.queueId, args.input);
      
      return {
        governanceId: rule.governance_id,
        queueId: rule.queue_id,
        ruleName: rule.rule_name,
        ruleType: rule.rule_type,
        ruleConfig: rule.rule_config,
        isActive: rule.is_active,
        effectiveFrom: rule.effective_from,
        effectiveUntil: rule.effective_until,
        createdAt: rule.created_at,
        updatedAt: rule.updated_at
      };
    },
    
    // Whitelist mutations
    addToWhitelist: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can manage whitelist');
      }
      
      const result = await walletWhitelistService.addToWhitelist(
        args.input.walletAddress,
        args.input.tierId,
        args.input.metadata
      );
      
      const db = await priorityQueueService.getDatabase();
      const entry = await db('wallet_whitelist').where({ wallet_address: args.input.walletAddress }).first();
      
      return {
        walletAddress: entry.wallet_address,
        tierId: entry.tier_id,
        metadata: entry.metadata,
        whitelistedAt: entry.whitelisted_at,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at
      };
    },
    
    removeFromWhitelist: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can manage whitelist');
      }
      
      const result = await walletWhitelistService.removeFromWhitelist(args.walletAddress);
      
      return {
        walletAddress: result.wallet_address,
        whitelisted: result.whitelisted
      };
    },
    
    addToBlacklist: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can manage blacklist');
      }
      
      const result = await walletWhitelistService.addToBlacklist(args.walletAddress, args.reason);
      
      const db = await priorityQueueService.getDatabase();
      const entry = await db('wallet_blacklist').where({ wallet_address: args.walletAddress }).first();
      
      return {
        walletAddress: entry.wallet_address,
        reason: entry.reason,
        blacklistedAt: entry.blacklisted_at,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at
      };
    },
    
    removeFromBlacklist: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can manage blacklist');
      }
      
      const result = await walletWhitelistService.removeFromBlacklist(args.walletAddress);
      
      return {
        walletAddress: result.wallet_address,
        blacklisted: result.blacklisted
      };
    },
    
    bulkAddToWhitelist: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can manage whitelist');
      }
      
      const results = await walletWhitelistService.bulkAddToWhitelist(
        args.input.wallets,
        args.input.defaultTierId
      );
      
      return {
        results: results.map(r => ({
          walletAddress: r.wallet_address,
          success: r.success,
          result: r.result,
          error: r.error
        }))
      };
    },
    
    updateWalletTier: async (_parent, args, context) => {
      if (!context.isAdmin) {
        throw new Error('Unauthorized: Only admins can update wallet tiers');
      }
      
      return walletWhitelistService.updateWalletTier(args.walletAddress, args.tierId);
    }
  }
};

export { typeDefs };
