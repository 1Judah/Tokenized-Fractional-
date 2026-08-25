/**
 * Indexing Engine with Ledger Re-org Handling (#416)
 *
 * Tracks ledger_hash & previous_ledger_hash, detects chain divergence,
 * purges orphaned database events, resyncs the canonical chain, and signals 503 guard status.
 */

let reorgInProgress = false;

export function isReorgInProgress() {
  return reorgInProgress;
}

export function setReorgInProgress(status) {
  reorgInProgress = Boolean(status);
}

export class IndexingEngine {
  constructor() {
    this.chainHead = null;
    this.ledgerHistory = []; // Array of { sequence, ledger_hash, previous_ledger_hash, events }
    this.indexedEvents = []; // Database event records
  }

  /**
   * Process incoming ledger block
   */
  async processLedgerBlock(block) {
    const { sequence, ledger_hash, previous_ledger_hash, events = [] } = block;

    // Check for genesis or initial block
    if (!this.chainHead) {
      this.chainHead = block;
      this.ledgerHistory.push(block);
      this.indexedEvents.push(...events.map((e) => ({ ...e, sequence, ledger_hash })));
      return { status: 'INDEXED', sequence };
    }

    // Detect ledger hash mismatch (Re-org detected!)
    if (this.chainHead.ledger_hash !== previous_ledger_hash) {
      return await this.handleLedgerReorg(block);
    }

    // Normal canonical block appending
    this.chainHead = block;
    this.ledgerHistory.push(block);
    this.indexedEvents.push(...events.map((e) => ({ ...e, sequence, ledger_hash })));

    return { status: 'INDEXED', sequence };
  }

  /**
   * Handle ledger re-org divergence
   */
  async handleLedgerReorg(divergentBlock, newCanonicalChain = []) {
    setReorgInProgress(true);

    try {
      // Find common ancestor in ledger history matching divergent block's previous hash
      let commonAncestorSeq = null;
      for (let i = this.ledgerHistory.length - 1; i >= 0; i -= 1) {
        if (this.ledgerHistory[i].ledger_hash === divergentBlock.previous_ledger_hash) {
          commonAncestorSeq = this.ledgerHistory[i].sequence;
          break;
        }
      }

      // If no direct ancestor found in memory window, rollback to safest block before divergence
      if (commonAncestorSeq === null && this.ledgerHistory.length > 0) {
        commonAncestorSeq = Math.max(1, divergentBlock.sequence - 1);
      }

      // 1. Rollback orphaned ledgers & purge invalid database rows
      this.rollbackOrphanedLedgers(commonAncestorSeq);

      // 2. Re-sync new canonical chain blocks
      const chainToSync = newCanonicalChain.length > 0 ? newCanonicalChain : [divergentBlock];
      for (const block of chainToSync) {
        this.chainHead = block;
        this.ledgerHistory.push(block);
        if (block.events) {
          this.indexedEvents.push(
            ...block.events.map((e) => ({ ...e, sequence: block.sequence, ledger_hash: block.ledger_hash }))
          );
        }
      }

      return {
        status: 'REORG_HANDLED',
        commonAncestorSeq,
        canonicalHeadSeq: this.chainHead ? this.chainHead.sequence : null,
      };
    } finally {
      setReorgInProgress(false);
    }
  }

  /**
   * Delete events linked to orphaned ledgers
   */
  rollbackOrphanedLedgers(commonAncestorSeq) {
    // Purge orphaned ledger blocks from history
    this.ledgerHistory = this.ledgerHistory.filter((block) => block.sequence <= commonAncestorSeq);

    // Purge orphaned event records from database
    this.indexedEvents = this.indexedEvents.filter((event) => event.sequence <= commonAncestorSeq);

    // Reset chain head to common ancestor
    this.chainHead = this.ledgerHistory.length > 0 ? this.ledgerHistory[this.ledgerHistory.length - 1] : null;
  }

  getEvents() {
    return [...this.indexedEvents];
  }

  getLedgerHistory() {
    return [...this.ledgerHistory];
  }
}
