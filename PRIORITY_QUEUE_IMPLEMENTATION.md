# Priority Queue System for Oversubscription

## Overview

The Priority Queue System is a sophisticated allocation mechanism designed to handle oversubscribed assets in the Tokenized Fractional RWA Marketplace. It provides fair, transparent, and configurable allocation when demand exceeds supply through multiple priority tiers, allocation algorithms, and comprehensive queue management.

## Features

### Priority Tiers
- **Platinum**: Highest priority for VIP investors (3.0x weight multiplier)
- **Gold**: High priority for accredited investors (2.0x weight multiplier)
- **Silver**: Medium priority for verified investors (1.5x weight multiplier)
- **Bronze**: Standard priority for general investors (1.0x weight multiplier)
- **Community**: Base priority for community members (0.5x weight multiplier)

### Allocation Algorithms
- **FIFO**: First-In-First-Out allocation based on queue position
- **Weighted**: Allocation based on tier weight multipliers
- **Lottery**: Random selection weighted by priority scores
- **Hybrid**: Combines guaranteed slots with weighted allocation

### Queue Management
- Join/leave queue functionality
- Real-time position tracking
- Automatic position rebalancing after withdrawals
- Dynamic priority score adjustment
- Queue event logging and audit trail

### Governance & Compliance
- Configurable governance rules (KYC requirements, allocation caps, time windows)
- Whitelist-only access control
- Compliance checking for queue entries
- Tier-based eligibility criteria

### Analytics & Monitoring
- Daily analytics snapshots
- Per-tier allocation statistics
- Queue performance metrics
- Allocation rate tracking

### Notifications
- Allocation offer notifications
- Queue position updates
- Allocation expiration alerts
- Delivery status tracking

### Whitelist Integration
- Wallet address whitelisting with tier assignment
- Blacklist support for restricted access
- Bulk whitelist operations
- Whitelist statistics and reporting

## Architecture

### Database Schema

The system uses the following tables:

- **priority_queues**: Queue configuration and status
- **priority_tiers**: Tier definitions and eligibility criteria
- **queue_entries**: User entries in queues with status tracking
- **queue_events**: Audit log of all queue events
- **queue_analytics**: Daily analytics snapshots
- **queue_governance**: Governance rules and policies
- **allocation_notifications**: Allocation notification tracking
- **wallet_whitelist**: Wallet address whitelist with tier assignments
- **wallet_blacklist**: Wallet address blacklist

### Service Components

1. **priorityQueueService**: Core queue management service
2. **walletWhitelistService**: Whitelist/blacklist management
3. **REST API**: HTTP endpoints for queue operations
4. **GraphQL API**: Federated GraphQL schema and resolvers

## Installation

### Database Migration

Run the migration to create the required tables:

```bash
cd backend
npm run migrate
```

This will execute the migration file: `20260727000000_create_priority_queue_tables.js`

### Service Initialization

The whitelist service should be initialized on application startup:

```javascript
import { walletWhitelistService } from './src/services/walletWhitelistService.js';

await walletWhitelistService.initialize();
```

## Usage

### Creating a Queue

```javascript
import { priorityQueueService, ALLOCATION_ALGORITHMS } from './src/services/priorityQueueService.js';

const queue = await priorityQueueService.createQueue({
  asset_contract_id: 'C1234567890123456789012345678901234567890123456789012345678',
  queue_name: 'Manhattan Tower Allocation',
  description: 'Priority queue for Manhattan Tower shares',
  allocation_algorithm: ALLOCATION_ALGORITHMS.HYBRID,
  total_slots: 1000,
  opens_at: new Date().toISOString(),
  closes_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  tier_config: {
    tier_platinum: { guaranteed_slots: 50, enabled: true },
    tier_gold: { guaranteed_slots: 100, enabled: true },
    tier_silver: { guaranteed_slots: 0, enabled: true },
    tier_bronze: { guaranteed_slots: 0, enabled: true },
    tier_community: { guaranteed_slots: 0, enabled: true }
  }
});
```

### Joining a Queue

```javascript
const entry = await priorityQueueService.joinQueue(
  queue.queue_id,
  'GABC1234567890123456789012345678901234567890123456789012345678',
  10, // requested shares
  {
    investment_amount: 100000,
    kyc_verified: true,
    whitelisted: true
  }
);
```

### Running Allocation

```javascript
const allocations = await priorityQueueService.runAllocation(queue.queue_id);

console.log(`Allocated to ${allocations.length} users`);
allocations.forEach(alloc => {
  console.log(`${alloc.user_wallet_address}: ${alloc.allocated_shares} shares`);
});
```

### Adjusting Priority Scores

```javascript
await priorityQueueService.adjustPriorityScores(queue.queue_id, {
  time_weight: 0.1,      // Bonus for longer wait times
  investment_weight: 1.0, // Bonus for higher investment amounts
  loyalty_weight: 0.5    // Bonus for historical allocations
});
```

### Managing Whitelist

```javascript
import { walletWhitelistService } from './src/services/walletWhitelistService.js';

// Add to whitelist with tier
await walletWhitelistService.addToWhitelist(
  'GABC1234567890123456789012345678901234567890123456789012345678',
  'tier_platinum',
  { investment_history: [1000000, 500000] }
);

// Check wallet status
const status = await walletWhitelistService.getWalletStatus(walletAddress);

// Bulk add to whitelist
const results = await walletWhitelistService.bulkAddToWhitelist([
  { wallet_address: 'G...', tier_id: 'tier_gold' },
  { wallet_address: 'G...', tier_id: 'tier_silver' }
]);
```

### Adding Governance Rules

```javascript
await priorityQueueService.addGovernanceRule(queue.queue_id, {
  rule_name: 'KYC Requirement',
  rule_type: 'KYC_REQUIRED',
  rule_config: {},
  is_active: true
});

await priorityQueueService.addGovernanceRule(queue.queue_id, {
  rule_name: 'Allocation Cap',
  rule_type: 'ALLOCATION_CAP',
  rule_config: { max_shares: 50 },
  is_active: true
});
```

## REST API Endpoints

### Queue Management

- `POST /api/v1/queues` - Create a new queue
- `GET /api/v1/queues/:queue_id` - Get queue by ID
- `GET /api/v1/queues/asset/:asset_contract_id` - Get queue by asset
- `PATCH /api/v1/queues/:queue_id` - Update queue
- `POST /api/v1/queues/:queue_id/open` - Open queue
- `POST /api/v1/queues/:queue_id/close` - Close queue

### Queue Entries

- `POST /api/v1/queues/:queue_id/join` - Join a queue
- `POST /api/v1/queues/entries/:entry_id/leave` - Leave a queue
- `GET /api/v1/queues/entries/:entry_id/position` - Get queue position

### Allocation

- `POST /api/v1/queues/:queue_id/allocate` - Run allocation
- `POST /api/v1/queues/:queue_id/adjust-priority` - Adjust priority scores

### Events & Analytics

- `GET /api/v1/queues/:queue_id/events` - Get queue events
- `GET /api/v1/queues/:queue_id/analytics` - Get queue analytics
- `POST /api/v1/queues/:queue_id/analytics/snapshot` - Generate analytics snapshot

### Governance

- `POST /api/v1/queues/:queue_id/governance` - Add governance rule
- `GET /api/v1/queues/:queue_id/governance` - Get active governance rules
- `GET /api/v1/queues/entries/:entry_id/compliance` - Check compliance

### Configuration

- `GET /api/v1/queues/config/tiers` - Get priority tier definitions
- `GET /api/v1/queues/config/algorithms` - Get allocation algorithms
- `GET /api/v1/queues/config/status` - Get queue entry statuses

## GraphQL API

### Queries

```graphql
query {
  queue(queueId: "queue_abc123") {
    queueId
    queueName
    allocationAlgorithm
    totalSlots
    availableSlots
    entries {
      entryId
      userWalletAddress
      requestedShares
      allocatedShares
      status
    }
  }
  
  queueEntries(queueId: "queue_abc123", status: PENDING) {
    entryId
    userWalletAddress
    queuePosition
    priorityScore
  }
  
  walletStatus(walletAddress: "G...") {
    whitelisted
    blacklisted
    tierId
  }
}
```

### Mutations

```graphql
mutation {
  createQueue(input: {
    assetContractId: "C..."
    queueName: "Test Queue"
    allocationAlgorithm: HYBRID
    totalSlots: 100
  }) {
    queueId
    queueName
  }
  
  joinQueue(input: {
    queueId: "queue_abc123"
    userWalletAddress: "G..."
    requestedShares: 10
    metadata: { investment_amount: 100000 }
  }) {
    entryId
    queuePosition
    tierId
  }
  
  runAllocation(queueId: "queue_abc123") {
    allocations {
      entryId
      allocatedShares
    }
    count
  }
}
```

## Allocation Algorithm Details

### FIFO (First-In-First-Out)
- Users are allocated shares in order of queue position
- Simple and predictable
- No tier weighting
- Best for: First-come-first-served scenarios

### Weighted
- Allocation based on tier weight multipliers
- Higher tiers get proportionally more allocations
- Priority scores determine allocation probability
- Best for: Tier-based preference systems

### Lottery
- Random selection weighted by priority scores
- Higher tiers have higher probability but not guaranteed
- Fair but unpredictable
- Best for: High-demand scenarios with tier preference

### Hybrid
- Combines guaranteed slots with weighted allocation
- Higher tiers get guaranteed slots first
- Remaining slots allocated using weighted algorithm
- Best for: Balanced approach with tier guarantees

## Priority Score Calculation

Priority scores are calculated based on:

1. **Base Score**: Determined by tier priority level (1000 - tier_level * 100)
2. **Algorithm Multiplier**: Applied based on allocation algorithm
3. **Dynamic Adjustments**: Time, investment, loyalty factors

### Formula Examples

**FIFO**: `baseScore - (queuePosition * 0.1)`

**Weighted**: `baseScore * tierWeightMultiplier`

**Lottery**: `tierWeightMultiplier * 100`

**Hybrid**: `(baseScore * tierWeightMultiplier) - (queuePosition * 0.05)`

### Dynamic Adjustments

Priority scores can be adjusted using:

- **Time Weight**: Bonus for longer wait times (per hour)
- **Investment Weight**: Bonus based on investment amount (logarithmic)
- **Loyalty Weight**: Bonus for historical allocations

## Governance Rules

### Available Rule Types

1. **ALLOCATION_CAP**: Maximum shares per user
2. **TIME_WINDOW**: Restrict queue access to specific time periods
3. **VERIFICATION_REQUIRED**: Require user verification
4. **WHITELIST_ONLY**: Only whitelisted wallets can join
5. **KYC_REQUIRED**: KYC verification required

### Example Configurations

```javascript
// Allocation cap
{
  rule_name: 'Max 50 shares per user',
  rule_type: 'ALLOCATION_CAP',
  rule_config: { max_shares: 50 }
}

// Time window
{
  rule_name: 'Business hours only',
  rule_type: 'TIME_WINDOW',
  rule_config: {
    start_time: '2024-01-01T09:00:00Z',
    end_time: '2024-01-01T17:00:00Z'
  }
}

// Whitelist only
{
  rule_name: 'Whitelist required',
  rule_type: 'WHITELIST_ONLY',
  rule_config: {}
}
```

## Whitelist System

### Tier Assignment

Wallets can be assigned to specific tiers when whitelisted:

```javascript
await walletWhitelistService.addToWhitelist(
  walletAddress,
  'tier_platinum', // Tier ID
  { metadata: 'optional' }
);
```

### Blacklist Management

Blacklisted wallets cannot join queues:

```javascript
await walletWhitelistService.addToBlacklist(
  walletAddress,
  'Reason for blacklisting'
);
```

### Bulk Operations

Efficiently manage multiple wallets:

```javascript
await walletWhitelistService.bulkAddToWhitelist([
  { wallet_address: 'G...', tier_id: 'tier_gold' },
  { wallet_address: 'G...', tier_id: 'tier_silver' }
], 'tier_bronze'); // Default tier
```

## Analytics

### Generating Snapshots

Generate daily analytics snapshots:

```javascript
const analytics = await priorityQueueService.generateAnalyticsSnapshot(queueId);
```

### Analytics Data Includes

- Total entries in queue
- Entries by tier distribution
- Average queue time
- Total requested vs allocated shares
- Allocation rate percentage
- Withdrawal count
- Per-tier allocation statistics

## Event Logging

All queue operations are logged for audit purposes:

- Queue creation/opening/closing
- User joins/leaves
- Position changes
- Allocation start/completion/failure
- Tier assignments
- Priority adjustments
- Governance updates

### Event Types

```javascript
QUEUE_CREATED
QUEUE_OPENED
QUEUE_CLOSED
USER_JOINED
USER_LEFT
POSITION_CHANGED
ALLOCATION_STARTED
ALLOCATION_COMPLETED
ALLOCATION_FAILED
TIER_ASSIGNED
PRIORITY_ADJUSTED
GOVERNANCE_UPDATED
```

## Testing

Run the test suite:

```bash
cd backend
npm test -- priorityQueue.test.js
```

The test suite covers:
- Queue management operations
- Entry management (join/leave/position)
- All allocation algorithms
- Priority score calculation
- Dynamic priority adjustment
- Event logging
- Analytics generation
- Governance rules
- Whitelist integration

## Security Considerations

1. **Admin Authentication**: Queue management operations require admin authentication
2. **Rate Limiting**: Write operations are rate-limited
3. **Input Validation**: All inputs are validated before processing
4. **Audit Logging**: All operations are logged for accountability
5. **Compliance Checking**: Governance rules are enforced before allocations

## Performance Optimization

1. **Database Indexing**: All frequently queried fields are indexed
2. **Memory Caching**: Whitelist data cached in memory for fast access
3. **Batch Operations**: Bulk operations for efficiency
4. **Async Processing**: Notifications sent asynchronously

## Troubleshooting

### Queue Not Accepting Entries
- Check if queue is active (`is_active: true`)
- Verify queue is within open/close time window
- Check if available slots > 0

### Allocation Not Running
- Verify queue has pending entries
- Check governance rules compliance
- Ensure allocation algorithm is valid

### Tier Assignment Issues
- Verify whitelist status
- Check eligibility criteria
- Review investment amount and KYC status

### Performance Issues
- Check database indexes are created
- Verify Redis connection for caching
- Review analytics snapshot frequency

## Future Enhancements

- Real-time WebSocket notifications for queue position updates
- Multi-asset queue support
- Advanced lottery algorithms (provably fair)
- Integration with external KYC providers
- Mobile app push notifications
- Advanced analytics dashboard
- Machine learning-based priority optimization

## Support

For issues or questions:
- Check the test suite for usage examples
- Review the event logs for debugging
- Consult the database schema for data structure
- Refer to this documentation for API details
