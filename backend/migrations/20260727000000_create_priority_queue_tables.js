/**
 * Priority Queue System Migration
 * Creates tables for managing oversubscription priority queues
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Priority queues table - manages queues for different assets
  await knex.schema.createTable('priority_queues', (table) => {
    table.string('queue_id').primary();
    table.string('asset_contract_id').notNullable().references('contract_id').inTable('assets').onDelete('CASCADE');
    table.string('queue_name').notNullable();
    table.text('description');
    table.enum('allocation_algorithm', ['FIFO', 'WEIGHTED', 'LOTTERY', 'HYBRID']).defaultTo('FIFO');
    table.integer('total_slots').notNullable();
    table.integer('available_slots').notNullable();
    table.timestamp('opens_at');
    table.timestamp('closes_at');
    table.boolean('is_active').defaultTo(true);
    table.jsonb('tier_config'); // Configuration for priority tiers
    table.jsonb('governance_rules'); // Queue governance settings
    table.timestamps(true, true);
    
    // Indexes for common queries
    table.index('asset_contract_id');
    table.index('is_active');
    table.index('opens_at');
    table.index('closes_at');
  });

  // Priority tier definitions table
  await knex.schema.createTable('priority_tiers', (table) => {
    table.string('tier_id').primary();
    table.string('name').notNullable();
    table.text('description');
    table.integer('priority_level').notNullable().unique(); // Lower number = higher priority
    table.decimal('weight_multiplier', 5, 2).defaultTo(1.0); // For weighted allocation
    table.integer('guaranteed_slots').defaultTo(0); // Slots guaranteed for this tier
    table.jsonb('eligibility_criteria'); // Rules for tier eligibility
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index('priority_level');
    table.index('is_active');
  });

  // Queue entries table - tracks users in queues
  await knex.schema.createTable('queue_entries', (table) => {
    table.string('entry_id').primary();
    table.string('queue_id').notNullable().references('queue_id').inTable('priority_queues').onDelete('CASCADE');
    table.string('user_wallet_address').notNullable();
    table.string('tier_id').references('tier_id').inTable('priority_tiers');
    table.integer('requested_shares').notNullable();
    table.integer('allocated_shares').defaultTo(0);
    table.integer('queue_position').notNullable();
    table.enum('status', ['PENDING', 'ALLOCATED', 'PARTIALLY_ALLOCATED', 'REJECTED', 'WITHDRAWN']).defaultTo('PENDING');
    table.decimal('priority_score', 10, 4).defaultTo(0); // Dynamic priority score
    table.timestamp('joined_at').defaultTo(knex.fn.now());
    table.timestamp('allocated_at');
    table.jsonb('metadata'); // Additional user/entry data
    table.timestamps(true, true);
    
    // Composite unique constraint to prevent duplicate entries
    table.unique(['queue_id', 'user_wallet_address']);
    
    // Indexes for queue operations
    table.index(['queue_id', 'queue_position']);
    table.index(['queue_id', 'status']);
    table.index(['queue_id', 'tier_id']);
    table.index('user_wallet_address');
    table.index('joined_at');
  });

  // Queue events table - for audit logging
  await knex.schema.createTable('queue_events', (table) => {
    table.string('event_id').primary();
    table.string('queue_id').notNullable().references('queue_id').inTable('priority_queues').onDelete('CASCADE');
    table.string('entry_id').references('entry_id').inTable('queue_entries').onDelete('SET NULL');
    table.string('user_wallet_address');
    table.enum('event_type', [
      'QUEUE_CREATED',
      'QUEUE_OPENED',
      'QUEUE_CLOSED',
      'USER_JOINED',
      'USER_LEFT',
      'POSITION_CHANGED',
      'ALLOCATION_STARTED',
      'ALLOCATION_COMPLETED',
      'ALLOCATION_FAILED',
      'TIER_ASSIGNED',
      'PRIORITY_ADJUSTED',
      'GOVERNANCE_UPDATED'
    ]).notNullable();
    table.jsonb('event_data'); // Event-specific data
    table.text('notes');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes for event queries
    table.index(['queue_id', 'created_at']);
    table.index('event_type');
    table.index('user_wallet_address');
  });

  // Queue analytics table - for tracking queue statistics
  await knex.schema.createTable('queue_analytics', (table) => {
    table.string('analytics_id').primary();
    table.string('queue_id').notNullable().references('queue_id').inTable('priority_queues').onDelete('CASCADE');
    table.date('snapshot_date').notNullable();
    table.integer('total_entries').defaultTo(0);
    table.integer('entries_by_tier'); // JSON object with tier counts
    table.integer('avg_queue_time_seconds').defaultTo(0);
    table.integer('total_requested_shares').defaultTo(0);
    table.integer('total_allocated_shares').defaultTo(0);
    table.decimal('allocation_rate', 5, 2).defaultTo(0); // Percentage of requests fulfilled
    table.integer('withdrawals').defaultTo(0);
    table.jsonb('tier_allocation_stats'); // Per-tier allocation statistics
    table.timestamps(true, true);
    
    // Unique constraint for daily snapshots
    table.unique(['queue_id', 'snapshot_date']);
    
    // Indexes for analytics queries
    table.index(['queue_id', 'snapshot_date']);
  });

  // Queue governance table - for managing queue rules and policies
  await knex.schema.createTable('queue_governance', (table) => {
    table.string('governance_id').primary();
    table.string('queue_id').notNullable().references('queue_id').inTable('priority_queues').onDelete('CASCADE');
    table.string('rule_name').notNullable();
    table.enum('rule_type', ['ALLOCATION_CAP', 'TIME_WINDOW', 'VERIFICATION_REQUIRED', 'WHITELIST_ONLY', 'KYC_REQUIRED']).notNullable();
    table.jsonb('rule_config').notNullable(); // Rule-specific configuration
    table.boolean('is_active').defaultTo(true);
    table.timestamp('effective_from').defaultTo(knex.fn.now());
    table.timestamp('effective_until');
    table.timestamps(true, true);
    
    // Indexes for governance queries
    table.index(['queue_id', 'is_active']);
    table.index(['queue_id', 'effective_from']);
  });

  // Allocation notifications table
  await knex.schema.createTable('allocation_notifications', (table) => {
    table.string('notification_id').primary();
    table.string('entry_id').notNullable().references('entry_id').inTable('queue_entries').onDelete('CASCADE');
    table.string('queue_id').notNullable().references('queue_id').inTable('priority_queues').onDelete('CASCADE');
    table.string('user_wallet_address').notNullable();
    table.enum('notification_type', ['ALLOCATION_OFFER', 'ALLOCATION_CONFIRMED', 'ALLOCATION_EXPIRED', 'QUEUE_POSITION_UPDATE']).notNullable();
    table.jsonb('notification_data');
    table.enum('status', ['PENDING', 'SENT', 'DELIVERED', 'FAILED']).defaultTo('PENDING');
    table.integer('retry_count').defaultTo(0);
    table.timestamp('expires_at');
    table.timestamp('sent_at');
    table.timestamps(true, true);
    
    // Indexes for notification queries
    table.index(['entry_id', 'status']);
    table.index(['queue_id', 'status']);
    table.index('user_wallet_address');
    table.index('expires_at');
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('allocation_notifications');
  await knex.schema.dropTableIfExists('queue_governance');
  await knex.schema.dropTableIfExists('queue_analytics');
  await knex.schema.dropTableIfExists('queue_events');
  await knex.schema.dropTableIfExists('queue_entries');
  await knex.schema.dropTableIfExists('priority_tiers');
  await knex.schema.dropTableIfExists('priority_queues');
}
