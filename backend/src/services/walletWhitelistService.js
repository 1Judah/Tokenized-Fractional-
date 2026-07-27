// Wallet Whitelist Service
// Manages whitelisting of wallet addresses for priority queue access

import { randomUUID } from 'crypto';
import { getDatabase } from './database.js';

class WalletWhitelistService {
  constructor() {
    this.db = null;
    this.memoryWhitelist = new Set();
    this.memoryBlacklist = new Set();
  }

  async getDatabase() {
    if (!this.db) {
      this.db = await getDatabase();
    }
    return this.db;
  }

  /**
   * Initialize the service by loading whitelist from database
   */
  async initialize() {
    const db = await this.getDatabase();
    
    try {
      // Create wallet_whitelist table if it doesn't exist
      const hasTable = await db.schema.hasTable('wallet_whitelist');
      if (!hasTable) {
        await db.schema.createTable('wallet_whitelist', (table) => {
          table.string('wallet_address').primary();
          table.string('tier_id'); // Optional tier assignment
          table.jsonb('metadata');
          table.timestamp('whitelisted_at').defaultTo(db.fn.now());
          table.timestamps(true, true);
        });
      }

      // Create wallet_blacklist table if it doesn't exist
      const hasBlacklistTable = await db.schema.hasTable('wallet_blacklist');
      if (!hasBlacklistTable) {
        await db.schema.createTable('wallet_blacklist', (table) => {
          table.string('wallet_address').primary();
          table.text('reason');
          table.timestamp('blacklisted_at').defaultTo(db.fn.now());
          table.timestamps(true, true);
        });
      }

      // Load into memory
      await this.syncFromDatabase();
    } catch (error) {
      console.error('Failed to initialize wallet whitelist service:', error);
    }
  }

  /**
   * Sync whitelist from database to memory
   */
  async syncFromDatabase() {
    const db = await this.getDatabase();
    
    try {
      const whitelist = await db('wallet_whitelist').select('wallet_address');
      const blacklist = await db('wallet_blacklist').select('wallet_address');
      
      this.memoryWhitelist.clear();
      this.memoryBlacklist.clear();
      
      whitelist.forEach(entry => this.memoryWhitelist.add(entry.wallet_address));
      blacklist.forEach(entry => this.memoryBlacklist.add(entry.wallet_address));
    } catch (error) {
      console.error('Failed to sync wallet lists from database:', error);
    }
  }

  /**
   * Add wallet to whitelist
   */
  async addToWhitelist(wallet_address, tier_id = null, metadata = {}) {
    const db = await this.getDatabase();
    
    await db('wallet_whitelist')
      .insert({
        wallet_address,
        tier_id,
        metadata,
        whitelisted_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict('wallet_address')
      .merge({
        tier_id,
        metadata,
        updated_at: new Date()
      });

    this.memoryWhitelist.add(wallet_address);
    
    return {
      wallet_address,
      tier_id,
      whitelisted: true
    };
  }

  /**
   * Remove wallet from whitelist
   */
  async removeFromWhitelist(wallet_address) {
    const db = await this.getDatabase();
    
    await db('wallet_whitelist').where({ wallet_address }).delete();
    this.memoryWhitelist.delete(wallet_address);
    
    return {
      wallet_address,
      whitelisted: false
    };
  }

  /**
   * Add wallet to blacklist
   */
  async addToBlacklist(wallet_address, reason = null) {
    const db = await this.getDatabase();
    
    await db('wallet_blacklist')
      .insert({
        wallet_address,
        reason,
        blacklisted_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict('wallet_address')
      .merge({
        reason,
        updated_at: new Date()
      });

    this.memoryBlacklist.add(wallet_address);
    
    // Also remove from whitelist if present
    if (this.memoryWhitelist.has(wallet_address)) {
      await this.removeFromWhitelist(wallet_address);
    }
    
    return {
      wallet_address,
      blacklisted: true,
      reason
    };
  }

  /**
   * Remove wallet from blacklist
   */
  async removeFromBlacklist(wallet_address) {
    const db = await this.getDatabase();
    
    await db('wallet_blacklist').where({ wallet_address }).delete();
    this.memoryBlacklist.delete(wallet_address);
    
    return {
      wallet_address,
      blacklisted: false
    };
  }

  /**
   * Check if wallet is whitelisted
   */
  isWhitelisted(wallet_address) {
    return this.memoryWhitelist.has(wallet_address);
  }

  /**
   * Check if wallet is blacklisted
   */
  isBlacklisted(wallet_address) {
    return this.memoryBlacklist.has(wallet_address);
  }

  /**
   * Get wallet whitelist status
   */
  async getWalletStatus(wallet_address) {
    const db = await this.getDatabase();
    
    const whitelistEntry = await db('wallet_whitelist').where({ wallet_address }).first();
    const blacklistEntry = await db('wallet_blacklist').where({ wallet_address }).first();
    
    return {
      wallet_address,
      whitelisted: this.isWhitelisted(wallet_address),
      blacklisted: this.isBlacklisted(wallet_address),
      tier_id: whitelistEntry?.tier_id || null,
      metadata: whitelistEntry?.metadata || {},
      blacklist_reason: blacklistEntry?.reason || null,
      whitelisted_at: whitelistEntry?.whitelisted_at || null,
      blacklisted_at: blacklistEntry?.blacklisted_at || null
    };
  }

  /**
   * Get all whitelisted wallets
   */
  getWhitelistedWallets() {
    return Array.from(this.memoryWhitelist);
  }

  /**
   * Get all blacklisted wallets
   */
  getBlacklistedWallets() {
    return Array.from(this.memoryBlacklist);
  }

  /**
   * Get whitelist with details
   */
  async getWhitelistDetails(limit = 100, offset = 0) {
    const db = await this.getDatabase();
    
    const results = await db('wallet_whitelist')
      .select('*')
      .limit(limit)
      .offset(offset)
      .orderBy('whitelisted_at', 'desc');
    
    const total = await db('wallet_whitelist').count('* as count').first();
    
    return {
      wallets: results,
      pagination: {
        total: total.count,
        limit,
        offset
      }
    };
  }

  /**
   * Get blacklist with details
   */
  async getBlacklistDetails(limit = 100, offset = 0) {
    const db = await this.getDatabase();
    
    const results = await db('wallet_blacklist')
      .select('*')
      .limit(limit)
      .offset(offset)
      .orderBy('blacklisted_at', 'desc');
    
    const total = await db('wallet_blacklist').count('* as count').first();
    
    return {
      wallets: results,
      pagination: {
        total: total.count,
        limit,
        offset
      }
    };
  }

  /**
   * Update wallet tier in whitelist
   */
  async updateWalletTier(wallet_address, tier_id) {
    const db = await this.getDatabase();
    
    const updated = await db('wallet_whitelist')
      .where({ wallet_address })
      .update({
        tier_id,
        updated_at: new Date()
      });
    
    if (updated === 0) {
      throw new Error('Wallet not found in whitelist');
    }
    
    return this.getWalletStatus(wallet_address);
  }

  /**
   * Bulk add wallets to whitelist
   */
  async bulkAddToWhitelist(wallets, default_tier_id = null) {
    const results = [];
    
    for (const wallet of wallets) {
      const wallet_address = typeof wallet === 'string' ? wallet : wallet.wallet_address;
      const tier_id = typeof wallet === 'string' ? default_tier_id : (wallet.tier_id || default_tier_id);
      const metadata = typeof wallet === 'string' ? {} : (wallet.metadata || {});
      
      try {
        const result = await this.addToWhitelist(wallet_address, tier_id, metadata);
        results.push({ wallet_address, success: true, result });
      } catch (error) {
        results.push({ wallet_address, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Bulk remove wallets from whitelist
   */
  async bulkRemoveFromWhitelist(wallet_addresses) {
    const results = [];
    
    for (const wallet_address of wallet_addresses) {
      try {
        await this.removeFromWhitelist(wallet_address);
        results.push({ wallet_address, success: true });
      } catch (error) {
        results.push({ wallet_address, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Get whitelist statistics
   */
  async getStatistics() {
    const db = await this.getDatabase();
    
    const totalWhitelisted = await db('wallet_whitelist').count('* as count').first();
    const totalBlacklisted = await db('wallet_blacklist').count('* as count').first();
    
    // Count by tier
    const tierCounts = await db('wallet_whitelist')
      .select('tier_id')
      .count('* as count')
      .groupBy('tier_id');
    
    const tierStats = tierCounts.reduce((acc, row) => {
      acc[row.tier_id || 'unassigned'] = row.count;
      return acc;
    }, {});
    
    return {
      total_whitelisted: totalWhitelisted.count || 0,
      total_blacklisted: totalBlacklisted.count || 0,
      tier_distribution: tierStats
    };
  }
}

// Export singleton instance
export const walletWhitelistService = new WalletWhitelistService();
